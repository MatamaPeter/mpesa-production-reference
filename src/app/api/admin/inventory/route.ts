import { digest } from "@/lib/security";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { requirePermission } from "@/lib/admin";
import { checkOrigin } from "@/lib/checkout-auth";
import { initializeBalance } from "@/lib/inventory";
import { audit } from "@/lib/audit";
import { Product } from "@/models/Product";
import { StockBalance } from "@/models/StockBalance";
import { StockMovement } from "@/models/StockMovement";
import { Warehouse } from "@/models/Warehouse";
import { apiError, readJSON, RequestError } from "@/lib/http";
export async function GET(req: NextRequest) {
  try {
    await requirePermission("inventory.write");
    const sku = req.nextUrl.searchParams.get("sku");
    return NextResponse.json({
      warehouses: await Warehouse.find({ active: true }).lean(),
      balances: await StockBalance.find(sku ? { sku } : {})
        .sort({ sku: 1 })
        .limit(200)
        .lean(),
      movements: await StockMovement.find(sku ? { sku } : {})
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    const actor = await requirePermission("inventory.write"),
      input = z
        .object({
          sku: z.string().regex(/^[a-z0-9-]{1,80}$/),
          warehouse: z.string().regex(/^[a-z0-9-]{1,60}$/),
          destination: z
            .string()
            .regex(/^[a-z0-9-]{1,60}$/)
            .optional(),
          quantity: z
            .number()
            .int()
            .min(-100000)
            .max(100000)
            .refine((n) => n !== 0),
          reason: z.string().trim().min(5).max(300),
          requestId: z.string().uuid(),
        })
        .strict()
        .safeParse(await readJSON(req));
    if (!input.success)
      throw new RequestError("Check the stock adjustment and reason");
    const d = input.data,
      requestHash = digest(JSON.stringify(input.data));
    if (d.destination && (d.quantity < 0 || d.destination === d.warehouse))
      throw new RequestError(
        "Transfers require a positive quantity and different warehouses",
      );
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const eventKey = `adjust:${d.requestId}`;
        const previous =
          await StockMovement.findById(eventKey).session(session);
        if (previous) {
          if (previous.requestHash !== requestHash)
            throw new RequestError(
              "This stock request key was used for a different operation",
              409,
            );
          return;
        }
        for (const warehouse of [d.warehouse, d.destination].filter(Boolean))
          if (
            !(await Warehouse.exists({ _id: warehouse, active: true }).session(
              session,
            ))
          )
            throw new RequestError("Warehouse not configured", 409);
        const product = await Product.findOneAndUpdate(
          {
            sku: d.sku,
            ...(!d.destination && d.quantity < 0
              ? { stock: { $gte: -d.quantity } }
              : {}),
          },
          {
            $inc: {
              inventoryVersion: 1,
              ...(!d.destination ? { stock: d.quantity } : {}),
            },
          },
          { session, returnDocument: "before" },
        );
        if (!product)
          throw new RequestError(
            "Product unavailable or adjustment exceeds stock",
            409,
          );
        await initializeBalance(d.sku, product.stock, session);
        const delta = d.destination ? -d.quantity : d.quantity;
        const result = await StockBalance.updateOne(
          {
            sku: d.sku,
            warehouse: d.warehouse,
            ...(delta < 0 ? { available: { $gte: -delta } } : {}),
          },
          { $inc: { available: delta } },
          { session, upsert: delta > 0 },
        );
        if (!result.matchedCount && !result.upsertedCount)
          throw new RequestError(
            "This warehouse has insufficient available stock",
            409,
          );
        if (d.destination)
          await StockBalance.updateOne(
            { sku: d.sku, warehouse: d.destination },
            { $inc: { available: d.quantity } },
            { session, upsert: true },
          );
        await StockMovement.create(
          [
            {
              _id: eventKey,
              requestHash,
              sku: d.sku,
              kind: d.destination ? "transfer" : "adjustment",
              quantity: d.destination ? 0 : d.quantity,
              allocations: [
                { warehouse: d.warehouse, qty: delta },
                ...(d.destination
                  ? [{ warehouse: d.destination, qty: d.quantity }]
                  : []),
              ],
              actor: actor.id,
            },
          ],
          { session },
        );
        await audit(
          actor.id,
          "inventory." + (d.destination ? "transfer" : "adjustment"),
          d.sku,
          {
            warehouse: d.warehouse,
            destination: d.destination,
            quantity: d.quantity,
            reason: d.reason,
          },
          session,
        );
      });
    } finally {
      await session.endSession();
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
