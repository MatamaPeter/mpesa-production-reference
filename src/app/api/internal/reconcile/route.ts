import { NextRequest, NextResponse } from "next/server";
import { safeCompare } from "@/lib/checkout-auth";
import { connectDB } from "@/lib/db";
import { Payment } from "@/models/Payment";
import { reconcilePayment } from "@/lib/reconcile";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  if (!safeCompare(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const payments = await Payment.find({ status: "pending", nextCheckAt: { $lte: new Date() } }).sort({ nextCheckAt: 1 }).limit(10).select("_id").lean();
  const results: Record<string, number> = {};
  for (const payment of payments) {
    try {
      const outcome = await reconcilePayment(String(payment._id));
      results[outcome] = (results[outcome] ?? 0) + 1;
    } catch (e) { console.error("[CRON_RECONCILE_ERROR]", { paymentId: String(payment._id), error: e instanceof Error ? e.message : "unknown" }); results.error = (results.error ?? 0) + 1; }
  }
  return NextResponse.json({ checked: payments.length, results });
}
