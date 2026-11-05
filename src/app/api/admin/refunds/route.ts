import { pageRecords } from "@/lib/pagination";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { Refund } from "@/models/Refund";
import { Order } from "@/models/Order";
import { requirePermission } from "@/lib/admin";
import { checkOrigin } from "@/lib/checkout-auth";
import { audit } from "@/lib/audit";
import { settleRefund } from "@/lib/refunds";
import { apiError, readJSON, RequestError } from "@/lib/http";
export async function GET(req: NextRequest) {
  try {
    await requirePermission("refunds.write");
    return NextResponse.json(await pageRecords(Refund, req, {}));
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    const actor = await requirePermission("refunds.write");
    if (
      !actor.legacy &&
      Date.now() - new Date(actor.mfaAt).getTime() > 15 * 60000
    )
      throw new RequestError("Reverify MFA before issuing refunds", 403);
    const input = z
      .object({
        orderId: z.string().regex(/^[a-f0-9]{24}$/i),
        amountMinor: z.number().int().positive().max(100000000),
        reason: z.string().trim().min(10).max(1000),
        requestId: z.string().uuid(),
      })
      .strict()
      .safeParse(await readJSON(req));
    if (!input.success) throw new RequestError("Invalid refund request");
    const d = input.data,
      session = await mongoose.startSession();
    let id = "";
    try {
      await session.withTransaction(async () => {
        const existing = await Refund.findOne({
          orderId: d.orderId,
          requestId: d.requestId,
        }).session(session);
        if (existing) {
          if (existing.amountMinor !== d.amountMinor)
            throw new RequestError("Refund request key conflict", 409);
          id = String(existing._id);
          return;
        }
        const order = await Order.findOneAndUpdate(
          {
            _id: d.orderId,
            status: "paid",
            paymentHold: { $ne: true },
            $expr: {
              $gte: [
                {
                  $subtract: [
                    "$totalPaidMinor",
                    {
                      $add: [
                        { $ifNull: ["$refundedMinor", 0] },
                        { $ifNull: ["$refundReservedMinor", 0] },
                      ],
                    },
                  ],
                },
                d.amountMinor,
              ],
            },
          },
          { $inc: { refundReservedMinor: d.amountMinor } },
          { session, returnDocument: "after" },
        );
        if (!order)
          throw new RequestError(
            "Refund exceeds the remaining paid amount or this order is on hold",
            409,
          );
        if (order.currency === "KES" && d.amountMinor % 100)
          throw new RequestError("KES refunds must use whole shillings");
        const provider = order.paymentMethod === "stripe" ? "stripe" : "manual";
        if (provider === "stripe" && !order.stripePaymentIntent)
          throw new RequestError(
            "Provider payment reference is missing. Reconcile the order first.",
            409,
          );
        const [refund] = await Refund.create(
          [
            {
              ...d,
              currency: order.currency,
              provider,
              paymentIntent: order.stripePaymentIntent,
              status: provider === "stripe" ? "queued" : "awaiting_manual",
              createdBy: actor.id,
              nextAttemptAt: new Date(),
            },
          ],
          { session },
        );
        id = String(refund._id);
        await audit(
          actor.id,
          "refund.requested",
          d.orderId,
          { refundId: id, amountMinor: d.amountMinor, reason: d.reason },
          session,
        );
      });
    } finally {
      await session.endSession();
    }
    return NextResponse.json(
      { ok: true, id, status: "queued_for_processing" },
      { status: 202 },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    const actor = await requirePermission("refunds.confirm");
    if (actor.legacy)
      throw new RequestError(
        "Manual refund confirmation requires a named staff account with MFA",
        403,
      );
    const input = z
      .object({
        id: z.string().regex(/^[a-f0-9]{24}$/i),
        providerReference: z.string().trim().min(6).max(160),
      })
      .strict()
      .safeParse(await readJSON(req));
    if (!input.success)
      throw new RequestError("Supply the verified provider refund reference");
    const row = await Refund.findOne({
      _id: input.data.id,
      provider: "manual",
      status: "awaiting_manual",
    });
    if (!row) throw new RequestError("Manual refund not found", 404);
    if (row.createdBy === actor.id)
      throw new RequestError(
        "A second authorized operator must verify manual refunds",
        403,
      );
    await settleRefund(
      String(row._id),
      "succeeded",
      input.data.providerReference,
      row.amountMinor,
      row.currency,
      actor.id,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
