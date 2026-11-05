import { TaxQuote } from "@/models/TaxQuote";
import { Shipment } from "@/models/Shipment";
import { orderAccess } from "@/lib/customer-auth";
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
    const access = await orderAccess();
    if (!access)
      return NextResponse.json({ error: "Session required" }, { status: 401 });
    await connectDB();
    const order = await Order.findOne({ _id: orderId, ...access }).lean();
    if (!order)
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const payment = order.activePaymentId
      ? await Payment.findById(order.activePaymentId).select("status").lean()
      : null;
    const rate = Number(process.env.MPESA_TAX_BASIS_POINTS);
    const mpesaAvailable =
      process.env.COMMERCE_LIVE === "true" &&
      process.env.MPESA_TAX_APPROVED === "true" &&
      (process.env.MPESA_TAX_PROVIDER === "stripe" ||
        (process.env.MPESA_TAX_BASIS_POINTS !== undefined &&
          Number.isInteger(rate) &&
          rate >= 0 &&
          rate <= 10000)) &&
      order.currency === "KES" &&
      order.address?.country === "KE";
    const mpesaTaxMinor =
      mpesaAvailable && process.env.MPESA_TAX_PROVIDER !== "stripe"
        ? Math.round((order.amountMinor * rate) / 10000 / 100) * 100
        : null;
    const quote =
      mpesaAvailable && process.env.MPESA_TAX_PROVIDER === "stripe"
        ? await TaxQuote.findOne({
            orderId: order._id,
            amountMinor: order.amountMinor,
            expiresAt: { $gt: new Date() },
          })
            .sort({ createdAt: -1 })
            .lean()
        : null;
    const shipments = await Shipment.find({
      orderId: order._id,
      status: "purchased",
    })
      .select("trackingNumber trackingUrl deliveryStatus warehouse")
      .lean();
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
        discountMinor: order.discountMinor ?? 0,
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
          quote?.totalMinor ??
          (mpesaTaxMinor !== null ? order.amountMinor + mpesaTaxMinor : null),
        mpesaTaxMinor: quote?.taxMinor ?? mpesaTaxMinor,
        mpesaTaxQuoteId: quote ? String(quote._id) : null,
        mpesaRoundingMinor: quote?.roundingMinor ?? 0,
        mpesaCanQuote:
          mpesaAvailable && process.env.MPESA_TAX_PROVIDER === "stripe",
        refundedMinor: order.refundedMinor ?? 0,
        refundReservedMinor: order.refundReservedMinor ?? 0,
        paymentHold: order.paymentHold ?? false,
        shipments,
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
