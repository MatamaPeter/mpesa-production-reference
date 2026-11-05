import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { safeCompare } from "@/lib/checkout-auth";
import { Payment } from "@/models/Payment";
import { CallbackInbox } from "@/models/CallbackInbox";
const schema = z.object({
  Body: z.object({
    stkCallback: z.object({
      CheckoutRequestID: z.string().min(1).max(200),
      MerchantRequestID: z.string().min(1).max(200),
      ResultCode: z.number().int(),
      ResultDesc: z.string().max(1000).optional(),
      CallbackMetadata: z
        .object({
          Item: z
            .array(
              z.object({
                Name: z.string().max(100),
                Value: z.unknown().optional(),
              }),
            )
            .max(20),
        })
        .optional(),
    }),
  }),
});
export async function POST(req: NextRequest) {
  const expected = process.env.MPESA_CALLBACK_TOKEN;
  if (
    !expected ||
    expected.length < 24 ||
    !safeCompare(req.nextUrl.searchParams.get("token") ?? "", expected)
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const reader = req.body?.getReader();
    if (!reader)
      return NextResponse.json({ error: "Missing body" }, { status: 400 });
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 12000) {
        await reader.cancel();
        return NextResponse.json({ error: "Too large" }, { status: 413 });
      }
      chunks.push(value);
    }
    let data;
    try {
      data = JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid callback" }, { status: 400 });
    const cb = parsed.data.Body.stkCallback;
    await connectDB();
    // Persist before lookup: a callback may arrive before initiation IDs are saved.
    await CallbackInbox.updateOne(
      { checkoutRequestId: cb.CheckoutRequestID },
      {
        $setOnInsert: {
          checkoutRequestId: cb.CheckoutRequestID,
          merchantRequestId: cb.MerchantRequestID,
          payload: cb,
        },
      },
      { upsert: true },
    );
    const payment = await Payment.findOne({
      checkoutRequestId: cb.CheckoutRequestID,
      merchantRequestId: cb.MerchantRequestID,
    });
    if (payment?.status === "pending") {
      await Payment.updateOne(
        {
          _id: payment._id,
          status: "pending",
          callbackPayload: { $exists: false },
        },
        { $set: { callbackPayload: cb, nextCheckAt: new Date() } },
      );
    }
    return NextResponse.json({ received: true });
  } catch {
    console.error("[CALLBACK] Persistence failed");
    return NextResponse.json(
      { error: "Callback unavailable" },
      { status: 503 },
    );
  }
}
