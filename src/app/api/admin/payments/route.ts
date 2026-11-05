import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { Payment } from "@/models/Payment";
import { CallbackInbox } from "@/models/CallbackInbox";
import { PaymentRecovery } from "@/models/PaymentRecovery";
import { Order } from "@/models/Order";
import { requirePermission } from "@/lib/admin";
import { checkOrigin } from "@/lib/checkout-auth";
import { releaseStock } from "@/lib/orders";
import { audit } from "@/lib/audit";
import { apiError, readJSON, RequestError } from "@/lib/http";
export async function GET() {
  try {
    await requirePermission("refunds.write");
    return NextResponse.json({
      items: await Payment.find({
        status: { $in: ["review", "initiating", "pending"] },
      })
        .sort({ createdAt: 1 })
        .limit(100)
        .select(
          "orderId amount status checkoutRequestId resultDescription createdAt",
        )
        .lean(),
      recoveries: await PaymentRecovery.find({ status: "requested" })
        .limit(100)
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
    const actor = await requirePermission("refunds.write"),
      input = z
        .object({
          paymentId: z.string().regex(/^[a-f0-9]{24}$/i),
          action: z.enum(["recheck", "request_release", "confirm_release"]),
          note: z.string().trim().min(10).max(1000),
          proofReference: z.string().trim().min(6).max(160).optional(),
          recoveryId: z
            .string()
            .regex(/^[a-f0-9]{24}$/i)
            .optional(),
        })
        .strict()
        .safeParse(await readJSON(req));
    if (!input.success)
      throw new RequestError("Check the recovery action and audit note");
    const d = input.data,
      session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const payment = await Payment.findById(d.paymentId).session(session);
        if (!payment || payment.status !== "review")
          throw new RequestError(
            "Only review payments can enter this recovery flow",
            409,
          );
        if (d.action === "recheck") {
          if (
            !payment.checkoutRequestId ||
            !(await CallbackInbox.exists({
              checkoutRequestId: payment.checkoutRequestId,
              merchantRequestId: payment.merchantRequestId,
            }).session(session))
          )
            throw new RequestError(
              "Matching provider identifiers and callback evidence are required before rechecking",
              409,
            );
          await Payment.updateOne(
            { _id: payment._id, status: "review" },
            {
              $set: {
                status: "pending",
                nextCheckAt: new Date(),
                lockedUntil: null,
              },
            },
            { session },
          );
        } else if (d.action === "request_release") {
          if (actor.legacy || !d.proofReference)
            throw new RequestError(
              "A named finance operator and independently verified no-charge reference are required",
              403,
            );
          if (
            await PaymentRecovery.exists({
              paymentId: payment._id,
              status: "requested",
            }).session(session)
          )
            throw new RequestError("A release review is already open", 409);
          await Payment.updateOne(
            { _id: payment._id },
            { $inc: { attemptCount: 1 } },
            { session },
          );
          await PaymentRecovery.create(
            [
              {
                paymentId: payment._id,
                requestedBy: actor.id,
                proofReference: d.proofReference,
                note: d.note,
                status: "requested",
              },
            ],
            { session },
          );
        } else {
          if (actor.legacy || !d.recoveryId)
            throw new RequestError(
              "A second named operator must confirm this release",
              403,
            );
          const recovery = await PaymentRecovery.findOne({
            _id: d.recoveryId,
            paymentId: payment._id,
            status: "requested",
          }).session(session);
          if (!recovery || recovery.requestedBy === actor.id)
            throw new RequestError(
              "Independent second-operator verification is required",
              403,
            );
          const order = await Order.findOne({
            _id: payment.orderId,
            status: "unpaid",
            activePaymentId: payment._id,
          }).session(session);
          if (!order)
            throw new RequestError(
              "Order state changed; investigate before release",
              409,
            );
          await Payment.updateOne(
            { _id: payment._id, status: "review" },
            {
              $set: {
                status: "failed",
                resultDescription:
                  "Two authorized operators independently confirmed no charge",
                nextCheckAt: null,
              },
            },
            { session },
          );
          await releaseStock(String(order._id), session);
          await PaymentRecovery.updateOne(
            { _id: recovery._id, status: "requested" },
            { $set: { status: "released", confirmedBy: actor.id } },
            { session },
          );
        }
        await audit(
          actor.id,
          "payment.recovery." + d.action,
          d.paymentId,
          { note: d.note, proofReference: d.proofReference },
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
