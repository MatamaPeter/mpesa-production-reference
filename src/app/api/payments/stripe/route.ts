import { assertTradingAllowed } from "@/lib/trading";
import { orderAccess, currentCustomer } from "@/lib/customer-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkOrigin, checkoutIdentity } from "@/lib/checkout-auth";
import { connectDB } from "@/lib/db";
import { Order } from "@/models/Order";
import { commerceEnabled } from "@/lib/store";
import { stripeClient } from "@/lib/stripe";
import { apiError, readJSON, RequestError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
export async function POST(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    if (
      !commerceEnabled() ||
      process.env.TAX_POLICY_APPROVED !== "true" ||
      !process.env.STRIPE_WEBHOOK_SECRET
    )
      throw new RequestError("Checkout is not open yet", 503);
    assertTradingAllowed();
    const parsed = z
      .object({ orderId: z.string().regex(/^[a-f0-9]{24}$/i) })
      .safeParse(await readJSON(req));
    if (!parsed.success) throw new RequestError("Invalid order");
    const access = await orderAccess();
    const ownerTokenHash =
      (await currentCustomer())?.id ?? (await checkoutIdentity());
    if (!access || !ownerTokenHash)
      throw new RequestError("Session required", 401);
    await rateLimit("stripe", ownerTokenHash, 10);
    const origin = process.env.APP_ORIGIN;
    if (!origin)
      throw new RequestError("Checkout configuration unavailable", 503);
    const stripe = stripeClient();
    await connectDB();
    const order = await Order.findOneAndUpdate(
      {
        _id: parsed.data.orderId,
        $and: [
          access!,
          {
            $or: [
              { paymentMethod: { $exists: false } },
              { paymentMethod: "stripe" },
            ],
          },
        ],
        status: "unpaid",
        activePaymentId: null,
        reservationExpiresAt: { $gt: new Date(Date.now() + 31 * 60000) },
      },
      { $set: { paymentMethod: "stripe" } },
      { returnDocument: "after" },
    );
    if (!order)
      throw new RequestError("Order expired or payment already active", 409);
    if (order.stripeSessionUrl)
      return NextResponse.json({ url: order.stripeSessionUrl });
    const a = order.address;
    const customer = await stripe.customers.create(
      {
        email: a.email,
        name: a.name,
        address: {
          line1: a.line1,
          line2: a.line2,
          city: a.city,
          state: a.region,
          postal_code: a.postalCode,
          country: a.country,
        },
        shipping: {
          name: a.name,
          phone: a.phone,
          address: {
            line1: a.line1,
            line2: a.line2,
            city: a.city,
            state: a.region,
            postal_code: a.postalCode,
            country: a.country,
          },
        },
      },
      { idempotencyKey: `customer-${order._id}` },
    );
    const checkout = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer: customer.id,
        allowed_payment_method_types: ["card"],
        automatic_tax: { enabled: true },
        line_items: [
          ...order.items.map(
            (i: {
              name: string;
              unitPrice: number;
              qty: number;
              lineTotalMinor?: number;
            }) => ({
              price_data: {
                currency: order.currency.toLowerCase(),
                unit_amount: i.lineTotalMinor ?? i.unitPrice * i.qty,
                product_data: { name: `${i.name} × ${i.qty}` },
                tax_behavior: "exclusive" as const,
              },
              quantity: 1,
            }),
          ),
          ...(order.shipping > 0
            ? [
                {
                  price_data: {
                    currency: order.currency.toLowerCase(),
                    unit_amount: order.shipping,
                    product_data: { name: "Delivery" },
                    tax_behavior: "exclusive" as const,
                  },
                  quantity: 1,
                },
              ]
            : []),
        ],
        client_reference_id: String(order._id),
        metadata: { orderId: String(order._id) },
        success_url: `${origin}/orders/${order._id}?payment=returned`,
        cancel_url: `${origin}/orders/${order._id}?payment=cancelled`,
        expires_at: Math.floor(
          new Date(order.reservationExpiresAt).getTime() / 1000,
        ),
        payment_intent_data: { metadata: { orderId: String(order._id) } },
      },
      { idempotencyKey: `checkout-${order._id}` },
    );
    await Order.updateOne(
      { _id: order._id, status: "unpaid" },
      {
        $set: { stripeSessionId: checkout.id, stripeSessionUrl: checkout.url },
      },
    );
    return NextResponse.json({ url: checkout.url });
  } catch (e) {
    return apiError(e);
  }
}
