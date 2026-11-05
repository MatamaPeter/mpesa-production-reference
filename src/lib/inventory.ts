import "server-only";
import type { ClientSession } from "mongoose";
import { Product } from "@/models/Product";
import { StockBalance } from "@/models/StockBalance";
import { StockMovement } from "@/models/StockMovement";
import { RequestError } from "./http";
export type Allocation = { warehouse: string; qty: number };
export async function initializeBalance(
  sku: string,
  stock: number,
  session: ClientSession,
) {
  if (!(await StockBalance.exists({ sku }).session(session)))
    await StockBalance.create(
      [{ sku, warehouse: "default", available: stock }],
      { session },
    );
}
export async function reserveProduct(
  sku: string,
  qty: number,
  eventKey: string,
  session: ClientSession,
) {
  const product = await Product.findOneAndUpdate(
    { sku, active: true, stock: { $gte: qty } },
    { $inc: { stock: -qty, inventoryVersion: 1 } },
    { session, returnDocument: "after" },
  );
  if (!product)
    throw new RequestError(
      "An item is unavailable or has insufficient stock",
      409,
    );
  await initializeBalance(sku, product.stock + qty, session);
  const balances = await StockBalance.find({ sku, available: { $gt: 0 } })
      .sort({ available: -1, warehouse: 1 })
      .session(session),
    allocations: Allocation[] = [];
  let remaining = qty;
  for (const row of balances) {
    const taken = Math.min(remaining, row.available);
    if (taken <= 0) continue;
    const result = await StockBalance.updateOne(
      { _id: row._id, available: { $gte: taken } },
      { $inc: { available: -taken } },
      { session },
    );
    if (!result.modifiedCount)
      throw new RequestError("Inventory changed. Retry checkout.", 409);
    allocations.push({ warehouse: row.warehouse, qty: taken });
    remaining -= taken;
    if (!remaining) break;
  }
  if (remaining)
    throw new RequestError("Warehouse inventory needs reconciliation", 409);
  await StockMovement.create(
    [
      {
        _id: `${eventKey}:${sku}:reserve`,
        sku,
        kind: "reserved",
        quantity: -qty,
        allocations,
      },
    ],
    { session },
  );
  return { product, allocations };
}
export async function returnInventory(
  items: { sku: string; qty: number; allocations?: Allocation[] }[],
  eventKey: string,
  session: ClientSession,
  kind = "released",
) {
  for (const item of items) {
    const existing = await StockMovement.exists({
      _id: `${eventKey}:${item.sku}:${kind}`,
    }).session(session);
    if (existing) continue;
    const product = await Product.findOneAndUpdate(
      { sku: item.sku },
      { $inc: { stock: item.qty, inventoryVersion: 1 } },
      { session, returnDocument: "before" },
    );
    if (!product)
      throw new RequestError("Product inventory needs operator review", 409);
    await initializeBalance(item.sku, product.stock, session);
    const allocations = item.allocations?.length
      ? item.allocations
      : [{ warehouse: "default", qty: item.qty }];
    if (allocations.reduce((sum, a) => sum + a.qty, 0) !== item.qty)
      throw new RequestError("Invalid stock allocation", 409);
    for (const a of allocations)
      await StockBalance.updateOne(
        { sku: item.sku, warehouse: a.warehouse },
        { $inc: { available: a.qty } },
        { upsert: true, session },
      );
    await StockMovement.create(
      [
        {
          _id: `${eventKey}:${item.sku}:${kind}`,
          sku: item.sku,
          kind,
          quantity: item.qty,
          allocations,
        },
      ],
      { session },
    );
  }
}
