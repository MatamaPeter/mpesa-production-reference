import "server-only";
import mongoose from "mongoose";
import type Stripe from "stripe";
import { Order } from "@/models/Order";
import { PaymentDispute } from "@/models/PaymentDispute";
import { audit } from "./audit";
export async function recordDispute(
  dispute: Stripe.Dispute,
  eventCreated: number,
) {
  const intent =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : dispute.payment_intent?.id;
  if (!intent) return;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const order = await Order.findOne({
        stripePaymentIntent: intent,
      }).session(session);
      if (!order) return;
      const existing = await PaymentDispute.findById(dispute.id).session(
        session,
      );
      if (
        existing?.providerUpdatedAt &&
        existing.providerUpdatedAt.getTime() > eventCreated * 1000
      )
        return;
      await PaymentDispute.updateOne(
        { _id: dispute.id },
        {
          $set: {
            orderId: order._id,
            amountMinor: dispute.amount,
            currency: dispute.currency,
            status: dispute.status,
            reason: dispute.reason,
            providerUpdatedAt: new Date(eventCreated * 1000),
          },
        },
        { upsert: true, session },
      );
      const unresolved = await PaymentDispute.countDocuments({
        orderId: order._id,
        status: { $nin: ["won", "warning_closed"] },
      }).session(session);
      await Order.updateOne(
        { _id: order._id },
        {
          $set: { paymentHold: unresolved > 0, disputeStatus: dispute.status },
        },
        { session },
      );
      await audit(
        "provider",
        "payment.dispute",
        String(order._id),
        { disputeId: dispute.id, status: dispute.status },
        session,
      );
    });
  } finally {
    await session.endSession();
  }
}
