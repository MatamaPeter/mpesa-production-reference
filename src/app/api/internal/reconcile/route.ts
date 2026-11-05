import { refreshMarketPrices } from "@/lib/exchange";
import { WorkerHeartbeat } from "@/models/WorkerHeartbeat";
import { processTaxJobs } from "@/lib/tax";
import { pollShipments } from "@/lib/shipping";
import { processRefunds } from "@/lib/refunds";
import { NextRequest, NextResponse } from "next/server";
import { safeCompare } from "@/lib/checkout-auth";
import { connectDB } from "@/lib/db";
import { Payment } from "@/models/Payment";
import { Order } from "@/models/Order";
import { reconcilePayment } from "@/lib/reconcile";
import { cancelOrder } from "@/lib/orders";
import { deliverNotifications } from "@/lib/notifications";
import { stripeClient } from "@/lib/stripe";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24)
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  if (!safeCompare(req.headers.get("authorization") ?? "", `Bearer ${secret}`))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const results: Record<string, number> = {};
    const payments = await Payment.find({
      status: "pending",
      nextCheckAt: { $lte: new Date() },
    })
      .sort({ nextCheckAt: 1 })
      .limit(2)
      .select("_id")
      .lean();
    for (const p of payments) {
      try {
        const outcome = await reconcilePayment(String(p._id));
        results[outcome] = (results[outcome] ?? 0) + 1;
      } catch {
        results.error = (results.error ?? 0) + 1;
      }
    }
    const stale = await Payment.updateMany(
      {
        status: "initiating",
        createdAt: { $lt: new Date(Date.now() - 5 * 60000) },
      },
      {
        $set: {
          status: "review",
          resultDescription:
            "Initiation interrupted; operator verification required",
          nextCheckAt: null,
        },
      },
    );
    results.initiationReview = stale.modifiedCount;
    const expired = await Order.find({
      status: "unpaid",
      reservationExpiresAt: { $lt: new Date() },
      activePaymentId: null,
    })
      .limit(2)
      .lean();
    for (const order of expired) {
      if (!order.paymentMethod) {
        await cancelOrder(String(order._id));
        results.expired = (results.expired ?? 0) + 1;
      } else if (order.paymentMethod === "stripe") {
        // A missing session ID can follow an interrupted provider call. Recover via the same idempotency key manually; never release uncertain stock.
        if (!order.stripeSessionId) {
          results.stripeReview = (results.stripeReview ?? 0) + 1;
          continue;
        }
        try {
          const s = await stripeClient().checkout.sessions.retrieve(
            order.stripeSessionId,
          );
          if (s.status === "expired") {
            await cancelOrder(String(order._id));
            results.expired = (results.expired ?? 0) + 1;
          } else if (s.payment_status === "paid") {
            results.webhookRequired = (results.webhookRequired ?? 0) + 1;
          }
        } catch {
          results.error = (results.error ?? 0) + 1;
        }
      }
    }
    const fx = await refreshMarketPrices();
    const [taxResult, shippingResult, refundResult, emailResult] =
      await Promise.allSettled([
        processTaxJobs(),
        pollShipments(),
        processRefunds(),
        deliverNotifications(),
      ]);
    const tax =
        taxResult.status === "fulfilled" ? taxResult.value : { taxError: true },
      shipping =
        shippingResult.status === "fulfilled"
          ? shippingResult.value
          : { shippingError: true },
      refunds =
        refundResult.status === "fulfilled"
          ? refundResult.value
          : { refundError: true },
      email =
        emailResult.status === "fulfilled"
          ? emailResult.value
          : { emailError: true };
    await WorkerHeartbeat.updateOne(
      { _id: "reconcile" },
      {
        $set: {
          lastRunAt: new Date(),
          lastResult: {
            ...results,
            ...email,
            ...refunds,
            ...shipping,
            ...tax,
            ...fx,
          },
        },
      },
      { upsert: true },
    );
    return NextResponse.json(
      { ...results, ...email, ...refunds, ...shipping, ...tax, ...fx },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    console.error("[RECONCILE] Scheduled reconciliation failed");
    return NextResponse.json(
      { error: "Reconciliation unavailable" },
      { status: 503 },
    );
  }
}
