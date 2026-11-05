import "server-only";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { queryStk } from "@/lib/mpesa";
import { Payment } from "@/models/Payment";
import { Order } from "@/models/Order";
import { CallbackInbox } from "@/models/CallbackInbox";
import { Product } from "@/models/Product";
import { queueNotification } from "./notifications";
import { receiptFromCallback } from "./payment-evidence";
const DUE = ["pending"];
const REVIEW_MS = 30 * 60_000;
async function defer(id: string, createdAt: Date, reason: string) {
  const review = Date.now() - createdAt.getTime() >= REVIEW_MS;
  await Payment.updateOne(
    { _id: id, status: { $in: DUE } },
    {
      $set: {
        status: review ? "review" : "pending",
        resultDescription: reason.slice(0, 200),
        nextCheckAt: review ? null : new Date(Date.now() + 60_000),
        lockedUntil: null,
      },
    },
  );
  return review ? "review" : "pending";
}
export async function reconcilePayment(id: string): Promise<string> {
  await connectDB();
  const payment = await Payment.findOneAndUpdate(
    {
      _id: id,
      status: "pending",
      $or: [{ lockedUntil: null }, { lockedUntil: { $lt: new Date() } }],
    },
    { $set: { lockedUntil: new Date(Date.now() + 90000) } },
    { returnDocument: "after" },
  );
  if (!payment) {
    const existing = await Payment.findById(id).select("status").lean();
    return existing?.status === "pending"
      ? "busy"
      : (existing?.status ?? "not_found");
  }
  if (!payment) return "not_found";
  if (payment.status !== "pending") return String(payment.status);
  if (!payment.checkoutRequestId)
    return defer(id, payment.createdAt, "CheckoutRequestID missing");
  if (!payment.callbackPayload) {
    const inbox = await CallbackInbox.findOne({
      checkoutRequestId: payment.checkoutRequestId,
      merchantRequestId: payment.merchantRequestId,
    }).lean();
    if (inbox) {
      payment.callbackPayload = inbox.payload;
      await Payment.updateOne(
        { _id: id, status: "pending", callbackPayload: { $exists: false } },
        { $set: { callbackPayload: inbox.payload } },
      );
    }
  }
  let result: Awaited<ReturnType<typeof queryStk>>;
  try {
    result = await queryStk(payment.checkoutRequestId);
  } catch (e) {
    console.error("[MPESA_QUERY_ERROR]", {
      paymentId: id,
      error: "Provider or database operation failed",
    });
    return defer(id, payment.createdAt, "Daraja query unavailable");
  }
  if (result.resultCode === null || !Number.isInteger(result.resultCode))
    return defer(id, payment.createdAt, "Daraja query inconclusive");
  const receipt = receiptFromCallback(payment);
  if (result.resultCode === 0 && !receipt) {
    await Payment.updateOne(
      { _id: id, status: "pending" },
      {
        $set: {
          status: "review",
          queriedAt: new Date(),
          nextCheckAt: null,
          resultDescription:
            "Query succeeded but matching callback receipt missing",
        },
      },
    );
    return "review";
  }
  if (result.resultCode !== 0 && receipt) {
    await Payment.updateOne(
      { _id: id, status: "pending" },
      {
        $set: {
          status: "review",
          queriedAt: new Date(),
          nextCheckAt: null,
          resultDescription: "Query conflicts with successful callback",
        },
      },
    );
    return "review";
  }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const current = await Payment.findById(id).session(session);
      if (!current || current.status !== "pending") return;
      if (receiptFromCallback(current) !== receipt)
        throw new Error("Callback evidence changed");
      if (result.resultCode === 0) {
        const order = await Order.updateOne(
          {
            _id: current.orderId,
            status: "unpaid",
            activePaymentId: current._id,
            amount: current.amount,
          },
          {
            $set: {
              status: "paid",
              paidAt: new Date(),
              totalPaidMinor: current.amount * 100,
              activePaymentId: null,
            },
          },
          { session },
        );
        if (order.modifiedCount !== 1) throw new Error("Order update conflict");
        const pay = await Payment.updateOne(
          { _id: id, status: "pending" },
          {
            $set: {
              status: "success",
              receipt,
              resultCode: 0,
              resultDescription:
                "STK query and callback matched; verify merchant settlement separately",
              queriedAt: new Date(),
              nextCheckAt: null,
            },
          },
          { session },
        );
        if (pay.modifiedCount !== 1) throw new Error("Payment update conflict");
        const paidOrder = await Order.findById(current.orderId).session(
          session,
        );
        if (paidOrder) await queueNotification(paidOrder, "receipt", session);
      } else {
        const pay = await Payment.updateOne(
          { _id: id, status: "pending" },
          {
            $set: {
              status: "failed",
              resultCode: result.resultCode,
              resultDescription: result.resultDesc,
              queriedAt: new Date(),
              nextCheckAt: null,
            },
          },
          { session },
        );
        if (pay.modifiedCount !== 1) throw new Error("Payment update conflict");
        const failedOrder = await Order.findOneAndUpdate(
          {
            _id: current.orderId,
            status: "unpaid",
            activePaymentId: current._id,
            stockReleased: false,
          },
          {
            $set: {
              status: "cancelled",
              activePaymentId: null,
              stockReleased: true,
            },
          },
          { session, returnDocument: "before" },
        );
        if (failedOrder)
          for (const item of failedOrder.items)
            await Product.updateOne(
              { sku: item.sku },
              { $inc: { stock: item.qty } },
              { session },
            );
      }
    });
  } catch (e) {
    console.error("[MPESA_TRANSACTION_ERROR]", {
      paymentId: id,
      error: "Provider or database operation failed",
    });
    return defer(id, payment.createdAt, "Database reconciliation conflict");
  } finally {
    await session.endSession();
  }
  const saved = await Payment.findById(id).select("status").lean();
  return saved?.status ?? "not_found";
}
