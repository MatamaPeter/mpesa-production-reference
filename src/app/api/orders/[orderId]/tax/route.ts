import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { Order } from "@/models/Order";
import { TaxQuote } from "@/models/TaxQuote";
import { orderAccess, currentCustomer } from "@/lib/customer-auth";
import { checkOrigin, checkoutIdentity } from "@/lib/checkout-auth";
import { stripeClient } from "@/lib/stripe";
import { rateLimit } from "@/lib/rate-limit";
import { apiError, RequestError } from "@/lib/http";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    if (
      process.env.MPESA_TAX_PROVIDER !== "stripe" ||
      process.env.MPESA_TAX_APPROVED !== "true"
    )
      throw new RequestError("Provider tax quotes are not configured", 503);
    const { orderId } = await params;
    if (!/^[a-f0-9]{24}$/i.test(orderId))
      throw new RequestError("Invalid order");
    const access = await orderAccess();
    if (!access) throw new RequestError("Session required", 401);
    await rateLimit(
      "tax-quote",
      (await currentCustomer())?.id ?? (await checkoutIdentity())!,
      5,
    );
    const order = await Order.findOne({
      _id: orderId,
      ...access,
      status: "unpaid",
      currency: "KES",
      "address.country": "KE",
      activePaymentId: null,
      reservationExpiresAt: { $gt: new Date() },
    }).lean();
    if (!order)
      throw new RequestError("Order unavailable for a tax quote", 409);
    const a = order.address;
    const calculation = await stripeClient().tax.calculations.create({
      currency: order.currency.toLowerCase(),
      line_items: order.items.map(
        (i: {
          sku: string;
          unitPrice: number;
          qty: number;
          lineTotalMinor?: number;
          taxCode?: string;
        }) => ({
          amount: i.lineTotalMinor ?? i.unitPrice * i.qty,
          quantity: i.qty,
          reference: i.sku,
          tax_behavior: "exclusive",
          tax_code: i.taxCode,
        }),
      ),
      shipping_cost: { amount: order.shipping, tax_behavior: "exclusive" },
      customer_details: {
        address: {
          line1: a.line1,
          line2: a.line2,
          city: a.city,
          state: a.region,
          postal_code: a.postalCode,
          country: a.country,
        },
        address_source: "shipping",
      },
    });
    if (
      !calculation.id ||
      calculation.currency !== "kes" ||
      calculation.amount_total !==
        order.amountMinor + calculation.tax_amount_exclusive
    )
      throw new Error("Tax calculation evidence mismatch");
    const totalMinor = Math.round(calculation.amount_total / 100) * 100,
      roundingMinor = totalMinor - calculation.amount_total;
    if (roundingMinor && process.env.MPESA_ROUNDING_APPROVED !== "true")
      throw new RequestError(
        "A whole-shilling M-Pesa rounding policy must be approved before payment",
        503,
      );
    const id = randomBytes(16).toString("hex"),
      expiresAt = new Date(
        Math.min(
          Date.now() + 15 * 60000,
          (calculation.expires_at ?? Math.floor(Date.now() / 1000) + 900) *
            1000,
        ),
      );
    await TaxQuote.create({
      _id: id,
      orderId: order._id,
      calculationId: calculation.id,
      amountMinor: order.amountMinor,
      taxMinor: calculation.tax_amount_exclusive,
      totalMinor,
      roundingMinor,
      expiresAt,
    });
    return NextResponse.json({
      id,
      totalMinor,
      taxMinor: calculation.tax_amount_exclusive,
      roundingMinor,
      expiresAt,
    });
  } catch (e) {
    return apiError(e);
  }
}
