import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { safeCompare } from "@/lib/checkout-auth";
import { Payment } from "@/models/Payment";
import { reconcilePayment } from "@/lib/reconcile";
export const runtime = "nodejs";
const schema = z.object({ Body: z.object({ stkCallback: z.object({ CheckoutRequestID: z.string(), MerchantRequestID: z.string(), ResultCode: z.number(), ResultDesc: z.string().optional(), CallbackMetadata: z.object({ Item: z.array(z.object({ Name: z.string(), Value: z.unknown().optional() })) }).optional() }) }) });
export async function POST(req: NextRequest) {
  const expected = process.env.MPESA_CALLBACK_TOKEN;
  if (!expected || expected.length < 24 || !safeCompare(req.nextUrl.searchParams.get("token") ?? "", expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const raw = await req.text();
    if (raw.length > 12000) return NextResponse.json({ error: "Too large" }, { status: 413 });
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success) return NextResponse.json({ error: "Invalid callback" }, { status: 400 });
    const cb = parsed.data.Body.stkCallback;
    await connectDB();
    const payment = await Payment.findOne({ checkoutRequestId: cb.CheckoutRequestID, merchantRequestId: cb.MerchantRequestID });
    if (!payment) { console.warn("[CALLBACK_UNMATCHED]", { checkoutRequestId: cb.CheckoutRequestID }); return NextResponse.json({ received: true }); }
    if (payment.status !== "pending") return NextResponse.json({ received: true });
    await Payment.updateOne({ _id: payment._id, status: "pending" }, { $set: { callbackPayload: cb, nextCheckAt: new Date() } });
    try { await reconcilePayment(String(payment._id)); } catch (e) { console.error("[CALLBACK_RECONCILE_ERROR]", e); }
    return NextResponse.json({ received: true });
  } catch (e) { console.error("[CALLBACK_ERROR]", e); return NextResponse.json({ error: "Callback unavailable" }, { status: 503 }); }
}
