import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import Stripe from "stripe";
import { stripeClient } from "@/lib/stripe";
import { Order } from "@/models/Order";
import { connectDB } from "@/lib/db";
import { queueNotification } from "@/lib/notifications";
import { cancelOrder } from "@/lib/orders";
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature"),
    secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret)
    return NextResponse.json({ error: "Webhook unavailable" }, { status: 400 });
  let event: Stripe.Event;
  try {
    const raw = await req.text();
    if (raw.length > 1000000)
      return NextResponse.json({ error: "Too large" }, { status: 413 });
    event = stripeClient().webhooks.constructEvent(raw, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  try {
    if (
      ![
        "checkout.session.completed",
        "checkout.session.expired",
        "checkout.session.async_payment_succeeded",
      ].includes(event.type)
    )
      return NextResponse.json({ received: true });
    const checkout = event.data.object as Stripe.Checkout.Session;
    const id = checkout.metadata?.orderId;
    if (!id || !/^[a-f0-9]{24}$/i.test(id))
      return NextResponse.json({ received: true });
    await connectDB();
    const order = await Order.findById(id);
    if (!order)
      return NextResponse.json({ error: "Order unavailable" }, { status: 409 });
    if (
      order.paymentMethod !== "stripe" ||
      checkout.client_reference_id !== id ||
      (order.stripeSessionId && order.stripeSessionId !== checkout.id)
    )
      return NextResponse.json({ error: "Payment mismatch" }, { status: 409 });
    if (event.type === "checkout.session.expired") {
      if (order.status === "unpaid") await cancelOrder(id);
      return NextResponse.json({ received: true });
    }
    if (checkout.payment_status !== "paid")
      return NextResponse.json({ received: true });
    if (
      checkout.currency?.toUpperCase() !== order.currency ||
      checkout.amount_subtotal !== order.amountMinor ||
      checkout.amount_total === null ||
      checkout.amount_total < order.amountMinor
    ) {
      await Order.updateOne(
        { _id: id, status: "unpaid" },
        { $set: { status: "review" } },
      );
      return NextResponse.json({ received: true });
    }
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const current = await Order.findById(id).session(session);
        if (current?.status === "paid") return;
        if (!current || current.status !== "unpaid" || current.stockReleased) {
          await Order.updateOne(
            { _id: id },
            { $set: { status: "review" } },
            { session },
          );
          return;
        }
        await Order.updateOne(
          { _id: id, status: "unpaid" },
          {
            $set: {
              status: "paid",
              paidAt: new Date(),
              stripeSessionId: checkout.id,
              taxMinor: checkout.total_details?.amount_tax ?? 0,
              totalPaidMinor: checkout.amount_total,
            },
          },
          { session },
        );
        current.totalPaidMinor = checkout.amount_total;
        await queueNotification(current, "receipt", session);
      });
    } finally {
      await session.endSession();
    }
    return NextResponse.json({ received: true });
  } catch {
    console.error("[STRIPE_WEBHOOK] Processing failed");
    return NextResponse.json(
      { error: "Processing unavailable" },
      { status: 503 },
    );
  }
}
