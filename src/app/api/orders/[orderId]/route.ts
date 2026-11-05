import { NextRequest, NextResponse } from "next/server";
import { checkoutIdentity } from "@/lib/checkout-auth";
import { connectDB } from "@/lib/db";
import { Payment } from "@/models/Payment";
import { Order } from "@/models/Order";
import { apiError } from "@/lib/http";
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ orderId: string }> },
) {
  try {
    const { orderId } = await ctx.params;
    if (!/^[a-f0-9]{24}$/i.test(orderId))
      return NextResponse.json({ error: "Invalid order" }, { status: 400 });
    const ownerTokenHash = await checkoutIdentity();
    if (!ownerTokenHash)
      return NextResponse.json({ error: "Session required" }, { status: 401 });
    await connectDB();
    const order = await Order.findOne({ _id: orderId, ownerTokenHash }).lean();
    if (!order)
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const payment = order.activePaymentId
      ? await Payment.findById(order.activePaymentId).select("status").lean()
      : null;
    const rate = Number(process.env.MPESA_TAX_BASIS_POINTS);
    const mpesaAvailable =
      process.env.COMMERCE_LIVE === "true" &&
      process.env.MPESA_TAX_APPROVED === "true" &&
      process.env.MPESA_TAX_BASIS_POINTS !== undefined &&
      Number.isInteger(rate) &&
      rate >= 0 &&
      rate <= 10000 &&
      order.currency === "KES" &&
      order.address?.country === "KE";
    const mpesaTaxMinor = mpesaAvailable
      ? Math.round((order.amountMinor * rate) / 10000 / 100) * 100
      : null;
    return NextResponse.json(
      {
        id: String(order._id),
        items: order.items.map(
          (i: {
            sku: string;
            name: string;
            qty: number;
            unitPrice: number;
          }) => ({
            sku: i.sku,
            name: i.name,
            qty: i.qty,
            unitPrice: i.unitPrice,
          }),
        ),
        currency: order.currency,
        subtotal: order.subtotal,
        shipping: order.shipping,
        amountMinor: order.amountMinor,
        taxMinor: order.taxMinor ?? null,
        totalPaidMinor: order.totalPaidMinor ?? null,
        status: order.status,
        paymentMethod: order.paymentMethod ?? null,
        activePaymentId: order.activePaymentId
          ? String(order.activePaymentId)
          : null,
        paymentStatus: payment?.status ?? null,
        mpesaQuoteMinor:
          mpesaTaxMinor !== null ? order.amountMinor + mpesaTaxMinor : null,
        mpesaTaxMinor,
        cardAvailable:
          process.env.COMMERCE_LIVE === "true" &&
          !!process.env.STRIPE_SECRET_KEY &&
          !!process.env.STRIPE_WEBHOOK_SECRET,
        fulfillment: order.fulfillment,
        trackingNumber: order.trackingNumber,
        createdAt: order.createdAt,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
