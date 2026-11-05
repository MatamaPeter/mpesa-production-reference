import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { checkoutIdentity, checkOrigin } from "@/lib/checkout-auth";
import { connectDB } from "@/lib/db";
import { normalizePhone, stkPush } from "@/lib/mpesa";
import { Order } from "@/models/Order";
import { Payment } from "@/models/Payment";
import { commerceEnabled } from "@/lib/store";
import { rateLimit } from "@/lib/rate-limit";
import { apiError, readJSON, RequestError } from "@/lib/http";
export const runtime = "nodejs";
const schema = z
  .object({
    orderId: z.string().regex(/^[a-f0-9]{24}$/i),
    phone: z.string().min(9).max(20),
    expectedTotalMinor: z.number().int().positive(),
  })
  .strict();
export async function POST(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    if (
      !commerceEnabled() ||
      process.env.TAX_POLICY_APPROVED !== "true" ||
      process.env.MPESA_TAX_APPROVED !== "true"
    )
      throw new RequestError("M-Pesa checkout is not open", 503);
    const required = [
      "MPESA_CONSUMER_KEY",
      "MPESA_CONSUMER_SECRET",
      "MPESA_SHORTCODE",
      "MPESA_PASSKEY",
      "MPESA_TRANSACTION_TYPE",
      "MPESA_CALLBACK_URL",
      "MPESA_CALLBACK_TOKEN",
    ];
    if (required.some((n) => !process.env[n]))
      throw new RequestError("M-Pesa configuration is incomplete", 503);
    try {
      const callback = new URL(process.env.MPESA_CALLBACK_URL!);
      if (
        callback.protocol !== "https:" ||
        callback.username ||
        callback.password ||
        process.env.MPESA_CALLBACK_TOKEN!.length < 24 ||
        callback.searchParams.get("token") !== process.env.MPESA_CALLBACK_TOKEN
      )
        throw new Error();
    } catch {
      throw new RequestError("M-Pesa callback configuration is invalid", 503);
    }
    const ownerTokenHash = await checkoutIdentity();
    if (!ownerTokenHash)
      throw new RequestError("Checkout session missing", 401);
    const parsed = schema.safeParse(await readJSON(req));
    if (!parsed.success) throw new RequestError("Invalid payment request");
    let phone: string;
    try {
      phone = normalizePhone(parsed.data.phone);
    } catch {
      throw new RequestError("Invalid Kenyan phone number");
    }
    const raw = process.env.MPESA_TAX_BASIS_POINTS,
      basisPoints = Number(raw);
    if (
      raw === undefined ||
      !Number.isInteger(basisPoints) ||
      basisPoints < 0 ||
      basisPoints > 10000
    )
      throw new RequestError("M-Pesa tax is not configured", 503);
    await rateLimit("mpesa", ownerTokenHash, 5);
    await connectDB();
    const paymentId = new mongoose.Types.ObjectId(),
      session = await mongoose.startSession();
    let amount = 0,
      reference = "";
    try {
      await session.withTransaction(async () => {
        const order = await Order.findOneAndUpdate(
          {
            _id: parsed.data.orderId,
            ownerTokenHash,
            status: "unpaid",
            activePaymentId: null,
            currency: "KES",
            "address.country": "KE",
            reservationExpiresAt: { $gt: new Date() },
            paymentMethod: { $exists: false },
          },
          { $set: { activePaymentId: paymentId, paymentMethod: "mpesa" } },
          { session, returnDocument: "after" },
        );
        if (!order)
          throw new RequestError(
            "Order unavailable or payment already active",
            409,
          );
        const taxMinor =
            Math.round((order.amountMinor * basisPoints) / 10000 / 100) * 100,
          finalMinor = order.amountMinor + taxMinor;
        if (!Number.isSafeInteger(finalMinor) || finalMinor % 100 !== 0)
          throw new RequestError("Invalid KES total", 409);
        if (finalMinor !== parsed.data.expectedTotalMinor)
          throw new RequestError(
            "The payment total changed. Refresh the order before paying.",
            409,
          );
        amount = finalMinor / 100;
        reference = String(order._id).slice(-12).toUpperCase();
        await Order.updateOne(
          { _id: order._id },
          { $set: { amount, taxMinor } },
          { session },
        );
        await Payment.create(
          [
            {
              _id: paymentId,
              orderId: order._id,
              phone,
              amount,
              reference,
              status: "initiating",
              nextCheckAt: new Date(Date.now() + 60000),
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    try {
      const pushed = await stkPush(phone, amount, reference);
      await Payment.updateOne(
        { _id: paymentId, status: "initiating" },
        {
          $set: {
            status: "pending",
            checkoutRequestId: pushed.checkoutRequestId,
            merchantRequestId: pushed.merchantRequestId,
            nextCheckAt: new Date(Date.now() + 30000),
          },
        },
      );
      return NextResponse.json(
        { paymentId: String(paymentId), status: "pending" },
        { status: 202 },
      );
    } catch {
      console.error("[STK_PUSH] Initiation requires operator verification", {
        paymentId: String(paymentId),
      });
      await Payment.updateOne(
        { _id: paymentId, status: "initiating" },
        {
          $set: {
            status: "review",
            resultDescription:
              "Initiation failed or outcome uncertain; verify before retry",
            nextCheckAt: null,
          },
        },
      );
      return NextResponse.json(
        {
          paymentId: String(paymentId),
          status: "review",
          error: "Payment initiation uncertain. Do not retry until reviewed.",
        },
        { status: 502 },
      );
    }
  } catch (e) {
    return apiError(e);
  }
}
