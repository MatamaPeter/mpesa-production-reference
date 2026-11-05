import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { checkoutIdentity, checkOrigin } from "@/lib/checkout-auth";
import { normalizePhone, stkPush } from "@/lib/mpesa";
import { Order } from "@/models/Order";
import { Payment } from "@/models/Payment";
export const runtime = "nodejs";
const schema = z.object({
  orderId: z.string().regex(/^[a-f0-9]{24}$/i),
  phone: z.string().min(9).max(20),
});
export async function POST(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  const ownerTokenHash = await checkoutIdentity();
  if (!ownerTokenHash)
    return NextResponse.json(
      { error: "Checkout session missing" },
      { status: 401 },
    );
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  let phone: string;
  try {
    phone = normalizePhone(parsed.data.phone);
  } catch {
    return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
  }
  await connectDB();
  // Atomic order claim prevents concurrent STK prompts on the same order.
  const paymentId = new mongoose.Types.ObjectId();
  const order = await Order.findOneAndUpdate(
    {
      _id: parsed.data.orderId,
      ownerTokenHash,
      status: "unpaid",
      activePaymentId: null,
    },
    { $set: { activePaymentId: paymentId } },
    { returnDocument: "after" },
  );
  if (!order)
    return NextResponse.json(
      { error: "Order unavailable or payment already active" },
      { status: 409 },
    );
  const reference = String(order._id).slice(-12).toUpperCase();
  try {
    await Payment.create({
      _id: paymentId,
      orderId: order._id,
      phone,
      amount: order.amount,
      reference,
      status: "initiating",
      nextCheckAt: new Date(Date.now() + 60_000),
    });
    const pushed = await stkPush(phone, order.amount, reference);
    // Do not overwrite a callback that may have arrived before this write.
    await Payment.updateOne(
      { _id: paymentId, status: "initiating" },
      {
        $set: {
          status: "pending",
          checkoutRequestId: pushed.checkoutRequestId,
          merchantRequestId: pushed.merchantRequestId,
          nextCheckAt: new Date(Date.now() + 30_000),
        },
      },
    );
    return NextResponse.json(
      { paymentId: String(paymentId), status: "pending" },
      { status: 202 },
    );
  } catch (e) {
    console.error("[STK_PUSH_ERROR]", {
      paymentId: String(paymentId),
      error: e instanceof Error ? e.message : "unknown",
    });
    // Request may have reached Safaricom despite a timeout. Hold for manual review; do not unlock for another charge.
    await Payment.updateOne(
      { _id: paymentId },
      {
        $set: {
          status: "review",
          resultDescription:
            "STK initiation failed or outcome uncertain; verify before retry",
          nextCheckAt: null,
        },
      },
    );
    return NextResponse.json(
      {
        error: "Payment initiation uncertain. Do not retry until reviewed.",
        paymentId: String(paymentId),
      },
      { status: 502 },
    );
  }
}
