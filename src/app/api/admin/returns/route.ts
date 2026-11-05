import { pageRecords } from "@/lib/pagination";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { ReturnRequest } from "@/models/ReturnRequest";
import { Warehouse } from "@/models/Warehouse";
import { requirePermission } from "@/lib/admin";
import { checkOrigin } from "@/lib/checkout-auth";
import { audit } from "@/lib/audit";
import { returnInventory } from "@/lib/inventory";
import { apiError, readJSON, RequestError } from "@/lib/http";
export async function GET(req: NextRequest) {
  try {
    await requirePermission("returns.manage");
    return NextResponse.json(await pageRecords(ReturnRequest, req, {}));
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    const actor = await requirePermission("returns.manage"),
      input = z
        .object({
          id: z.string().regex(/^[a-f0-9]{24}$/i),
          action: z.enum([
            "approve",
            "reject",
            "in_transit",
            "receive",
            "restock",
            "close",
          ]),
          note: z.string().trim().min(5).max(2000),
          trackingReference: z.string().max(160).optional(),
          warehouse: z
            .string()
            .regex(/^[a-z0-9-]{1,60}$/)
            .optional(),
        })
        .strict()
        .safeParse(await readJSON(req));
    if (!input.success)
      throw new RequestError("Check the return action and audit note");
    const d = input.data,
      session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const record = await ReturnRequest.findById(d.id).session(session);
        if (!record) throw new RequestError("Return not found", 404);
        if (d.action === "restock") {
          await requirePermission("inventory.write");
          if (record.status !== "received" || record.restocked)
            throw new RequestError(
              "Only received, unrestocked returns can be restocked",
              409,
            );
          const warehouse = d.warehouse ?? "default";
          if (
            !(await Warehouse.exists({ _id: warehouse, active: true }).session(
              session,
            ))
          )
            throw new RequestError("Invalid warehouse");
          await returnInventory(
            record.items.map((i: { sku: string; qty: number }) => ({
              sku: i.sku,
              qty: i.qty,
              allocations: [{ warehouse, qty: i.qty }],
            })),
            `return:${record._id}`,
            session,
            "returned",
          );
          await ReturnRequest.updateOne(
            { _id: record._id, restocked: false },
            { $set: { restocked: true, operatorNote: d.note } },
            { session },
          );
        } else {
          const transitions: { [key: string]: { from: string[]; to: string } } =
            {
              approve: { from: ["requested"], to: "approved" },
              reject: { from: ["requested"], to: "rejected" },
              in_transit: { from: ["approved"], to: "in_transit" },
              receive: { from: ["approved", "in_transit"], to: "received" },
              close: { from: ["received"], to: "closed" },
            };
          const t = transitions[d.action];
          if (!t.from.includes(record.status))
            throw new RequestError("Invalid return transition", 409);
          await ReturnRequest.updateOne(
            { _id: record._id, status: record.status },
            {
              $set: {
                status: t.to,
                operatorNote: d.note,
                trackingReference:
                  d.trackingReference ?? record.trackingReference,
              },
            },
            { session },
          );
        }
        await audit(
          actor.id,
          "return." + d.action,
          d.id,
          { note: d.note, warehouse: d.warehouse },
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
