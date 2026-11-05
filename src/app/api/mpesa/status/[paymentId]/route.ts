import { orderAccess } from "@/lib/customer-auth";
import { NextRequest, NextResponse } from "next/server";
import { checkoutIdentity } from "@/lib/checkout-auth";
import { connectDB } from "@/lib/db";
import { Payment } from "@/models/Payment";
import { Order } from "@/models/Order";
import { apiError } from "@/lib/http";
export const runtime = "nodejs";
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ paymentId: string }> },
) {
  try {
    const { paymentId } = await ctx.params;
    if (!/^[a-f0-9]{24}$/i.test(paymentId))
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    const access = await orderAccess();
    if (!access)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();
    const payment = await Payment.findById(paymentId)
      .select("orderId status")
      .lean();
    if (!payment)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    const order = await Order.findOne({ _id: payment.orderId, ...access })
      .select("_id")
      .lean();
    if (!order)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(
      { status: payment.status },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
