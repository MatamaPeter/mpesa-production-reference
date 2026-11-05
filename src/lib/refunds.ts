import { TaxJob } from "@/models/TaxJob";
import "server-only";
import mongoose from "mongoose";
import { Refund } from "@/models/Refund";
import { Order } from "@/models/Order";
import { EmailOutbox } from "@/models/EmailOutbox";
import { stripeClient } from "./stripe";
import { audit } from "./audit";
import { site } from "@/config/site";
import { formatMoney } from "./catalog";
export async function settleRefund(
  id: string,
  status: "succeeded" | "failed",
  providerId: string,
  amount: number,
  currency: string,
  actor = "provider",
) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const refund = await Refund.findById(id).session(session);
      if (!refund) return;
      if (refund.status === "succeeded" || refund.status === "failed") {
        if (refund.status !== status) {
          await Order.updateOne(
            { _id: refund.orderId },
            {
              $set: {
                paymentHold: true,
                disputeStatus: "conflicting_refund_evidence",
              },
            },
            { session },
          );
          await audit(
            "provider",
            "refund.conflicting_evidence",
            String(refund.orderId),
            { refundId: id },
            session,
          );
        }
        return;
      }
      if (actor === "provider" && refund.provider !== "stripe")
        throw new Error("Refund provider mismatch");
      if (
        refund.amountMinor !== amount ||
        refund.currency.toLowerCase() !== currency.toLowerCase() ||
        (refund.providerId && refund.providerId !== providerId)
      )
        throw new Error("Refund evidence mismatch");
      const order = await Order.findOneAndUpdate(
        { _id: refund.orderId, refundReservedMinor: { $gte: amount } },
        {
          $inc: {
            refundReservedMinor: -amount,
            ...(status === "succeeded" ? { refundedMinor: amount } : {}),
          },
        },
        { session, returnDocument: "after" },
      );
      if (!order) throw new Error("Refund reservation missing");
      await Refund.updateOne(
        { _id: id, status: refund.status },
        {
          $set: {
            status,
            providerId,
            lockedUntil: null,
            ...(actor !== "provider"
              ? { confirmedBy: actor, providerReference: providerId }
              : {}),
          },
        },
        { session },
      );
      await audit(
        actor,
        "refund." + status,
        String(refund.orderId),
        { refundId: id, amountMinor: amount },
        session,
      );
      if (status === "succeeded" && order.taxCalculationId)
        await TaxJob.updateOne(
          { _id: `refund:${id}` },
          {
            $setOnInsert: {
              orderId: order._id,
              refundId: id,
              calculationId: order.taxCalculationId,
              kind:
                order.refundedMinor === order.totalPaidMinor
                  ? "full_reversal"
                  : "partial_review",
              status:
                order.refundedMinor === order.totalPaidMinor
                  ? "queued"
                  : "review",
              note:
                order.refundedMinor === order.totalPaidMinor
                  ? ""
                  : "Allocate the partial refund to tax line items with the merchant tax advisor before reporting",
            },
          },
          { upsert: true, session },
        );
      if (status === "succeeded" && order.address?.email)
        await EmailOutbox.updateOne(
          { eventKey: `refund:${id}` },
          {
            $setOnInsert: {
              eventKey: `refund:${id}`,
              to: order.address.email,
              subject: `${site.brand.name}: refund confirmed`,
              text: `A refund of ${formatMoney(amount, order.currency)} has been confirmed for order ${order._id}. Your payment provider determines when funds appear in your account. Reference: ${providerId}`,
              status: "pending",
              nextAttemptAt: new Date(),
            },
          },
          { session, upsert: true },
        );
    });
  } finally {
    await session.endSession();
  }
}
export async function processRefunds() {
  if (process.env.PAYMENT_WORKER_ENABLED !== "true")
    return { refundWorkerEnabled: false };
  let processed = 0,
    review = 0;
  for (let i = 0; i < 2; i++) {
    const row = await Refund.findOneAndUpdate(
      {
        provider: "stripe",
        $or: [
          { status: "queued", nextAttemptAt: { $lte: new Date() } },
          { status: "sending", lockedUntil: { $lt: new Date() } },
        ],
      },
      {
        $set: {
          status: "sending",
          lockedUntil: new Date(Date.now() + 5 * 60000),
        },
        $inc: { attempts: 1 },
      },
      { returnDocument: "after", sort: { createdAt: 1 } },
    );
    if (!row) break;
    if (
      row.attempts > 4 ||
      Date.now() - row.createdAt.getTime() > 23 * 3600000
    ) {
      await Refund.updateOne(
        { _id: row._id, status: "sending" },
        { $set: { status: "review", lockedUntil: null } },
      );
      review++;
      continue;
    }
    try {
      const result = await stripeClient().refunds.create(
        {
          payment_intent: row.paymentIntent,
          amount: row.amountMinor,
          metadata: { refundId: String(row._id), orderId: String(row.orderId) },
        },
        { idempotencyKey: `refund-${row._id}` },
      );
      if (
        result.amount !== row.amountMinor ||
        result.currency.toUpperCase() !== row.currency
      )
        throw new Error("Unexpected refund evidence");
      if (result.status === "succeeded")
        await settleRefund(
          String(row._id),
          "succeeded",
          result.id,
          result.amount,
          result.currency,
        );
      else if (result.status === "failed" || result.status === "canceled")
        await settleRefund(
          String(row._id),
          "failed",
          result.id,
          result.amount,
          result.currency,
        );
      else
        await Refund.updateOne(
          { _id: row._id, status: "sending" },
          {
            $set: {
              status: "pending",
              providerId: result.id,
              lockedUntil: null,
            },
          },
        );
      processed++;
    } catch {
      await Refund.updateOne(
        { _id: row._id, status: "sending" },
        {
          $set: {
            status: "queued",
            lockedUntil: null,
            nextAttemptAt: new Date(Date.now() + 5 * 60000),
          },
        },
      );
    }
  }
  return {
    refundWorkerEnabled: true,
    refundsProcessed: processed,
    refundsReview: review,
  };
}
