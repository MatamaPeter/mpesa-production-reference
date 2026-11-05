import "server-only";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { queryStk } from "@/lib/mpesa";
import { Payment } from "@/models/Payment";
import { Order } from "@/models/Order";
const DUE = ["pending"];
const REVIEW_MS = 30 * 60_000;
function receiptFromCallback(payment: any): string | null {
  const cb = payment.callbackPayload;
  if (!cb || cb.CheckoutRequestID !== payment.checkoutRequestId || (payment.merchantRequestId && cb.MerchantRequestID !== payment.merchantRequestId) || cb.ResultCode !== 0) return null;
  if (!Array.isArray(cb.CallbackMetadata?.Item)) return null;
  const fields = Object.fromEntries(cb.CallbackMetadata.Item.map((x: any) => [x.Name, x.Value]));
  if (Number(fields.Amount) !== payment.amount || String(fields.PhoneNumber) !== payment.phone || typeof fields.MpesaReceiptNumber !== "string" || !fields.MpesaReceiptNumber) return null;
  return fields.MpesaReceiptNumber;
}
async function defer(id: string, createdAt: Date, reason: string) {
  const review = Date.now() - createdAt.getTime() >= REVIEW_MS;
  await Payment.updateOne({ _id: id, status: { $in: DUE } }, { $set: { status: review ? "review" : "pending", resultDescription: reason.slice(0, 200), nextCheckAt: review ? null : new Date(Date.now() + 60_000), lockedUntil: null } });
  return review ? "review" : "pending";
}
export async function reconcilePayment(id: string): Promise<string> {
  await connectDB();
  const payment = await Payment.findById(id);
  if (!payment) return "not_found";
  if (payment.status !== "pending") return String(payment.status);
  if (!payment.checkoutRequestId) return defer(id, payment.createdAt, "CheckoutRequestID missing");
  let result: Awaited<ReturnType<typeof queryStk>>;
  try {
    result = await queryStk(payment.checkoutRequestId);
  } catch (e) {
    console.error("[MPESA_QUERY_ERROR]", { paymentId: id, error: e instanceof Error ? e.message : "unknown" });
    return defer(id, payment.createdAt, "Daraja query unavailable");
  }
  if (result.resultCode === null || !Number.isInteger(result.resultCode)) return defer(id, payment.createdAt, "Daraja query inconclusive");
  const receipt = receiptFromCallback(payment);
  if (result.resultCode === 0 && !receipt) {
    await Payment.updateOne({ _id: id, status: "pending" }, { $set: { status: "review", queriedAt: new Date(), nextCheckAt: null, resultDescription: "Query succeeded but matching callback receipt missing" } });
    return "review";
  }
  if (result.resultCode !== 0 && receipt) {
    await Payment.updateOne({ _id: id, status: "pending" }, { $set: { status: "review", queriedAt: new Date(), nextCheckAt: null, resultDescription: "Query conflicts with successful callback" } });
    return "review";
  }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const current = await Payment.findById(id).session(session);
      if (!current || current.status !== "pending") return;
      if (result.resultCode === 0) {
        if (receiptFromCallback(current) !== receipt) throw new Error("Callback evidence changed");
        const order = await Order.updateOne({ _id: current.orderId, status: "unpaid", activePaymentId: current._id, amount: current.amount }, { $set: { status: "paid", paidAt: new Date(), activePaymentId: null } }, { session });
        if (order.modifiedCount !== 1) throw new Error("Order update conflict");
        const pay = await Payment.updateOne({ _id: id, status: "pending" }, { $set: { status: "success", receipt, resultCode: 0, resultDescription: "STK query and callback matched; verify merchant settlement separately", queriedAt: new Date(), nextCheckAt: null } }, { session });
        if (pay.modifiedCount !== 1) throw new Error("Payment update conflict");
      } else {
        const pay = await Payment.updateOne({ _id: id, status: "pending" }, { $set: { status: "failed", resultCode: result.resultCode, resultDescription: result.resultDesc, queriedAt: new Date(), nextCheckAt: null } }, { session });
        if (pay.modifiedCount !== 1) throw new Error("Payment update conflict");
        await Order.updateOne({ _id: current.orderId, status: "unpaid", activePaymentId: current._id }, { $set: { activePaymentId: null } }, { session });
      }
    });
  } catch (e) {
    console.error("[MPESA_TRANSACTION_ERROR]", { paymentId: id, error: e instanceof Error ? e.message : "unknown" });
    return defer(id, payment.createdAt, "Database reconciliation conflict");
  } finally { await session.endSession(); }
  const saved = await Payment.findById(id).select("status").lean();
  return saved?.status ?? "not_found";
}
