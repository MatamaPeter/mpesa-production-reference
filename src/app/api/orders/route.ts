import { site } from "@/config/site";
import { assertTradingAllowed } from "@/lib/trading";
import {
  exchangeSnapshot,
  unitPrice as resolveUnitPrice,
} from "@/lib/exchange";
import { reserveCoupon } from "@/lib/coupons";
import { allocateDiscount } from "@/lib/discounts";
import { reserveProduct } from "@/lib/inventory";
import { currentCustomer } from "@/lib/customer-auth";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { connectDB } from "@/lib/db";
import { checkOrigin, checkoutIdentity } from "@/lib/checkout-auth";
import { Order } from "@/models/Order";
import { Product } from "@/models/Product";
import {
  orderSchema,
  consolidateItems,
  checkedTotal,
  shippingQuote,
} from "@/lib/commerce";
import { commerceEnabled } from "@/lib/store";
import { readJSON, apiError, RequestError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    if (!commerceEnabled() || process.env.TAX_POLICY_APPROVED !== "true")
      throw new RequestError(
        "Checkout is not open yet. Please check back soon.",
        503,
      );
    assertTradingAllowed();
    const parsed = orderSchema.safeParse(await readJSON(req));
    if (!parsed.success)
      throw new RequestError("Please check your items and delivery details");
    const key = req.headers.get("idempotency-key");
    if (!key || !/^[a-zA-Z0-9-]{16,80}$/.test(key))
      throw new RequestError("A valid idempotency key is required");
    const customer = await currentCustomer();
    const ownerTokenHash = customer
      ? `account:${customer.id}`
      : await checkoutIdentity(true);
    if (!ownerTokenHash) throw new RequestError("Session unavailable", 401);
    await rateLimit("orders", ownerTokenHash, 12);
    const input = parsed.data;
    let requested;
    try {
      requested = consolidateItems(input.items);
    } catch {
      throw new RequestError("Maximum 10 units per product");
    }
    let shipping: number;
    try {
      shipping = shippingQuote(input.address.country, input.currency);
    } catch {
      throw new RequestError(
        "Delivery is unavailable for this destination and currency",
      );
    }
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          ...input,
          items: requested.sort((a, b) => a.sku.localeCompare(b.sku)),
        }),
      )
      .digest("hex");
    await connectDB();
    const fx = await exchangeSnapshot();
    const orderId = new mongoose.Types.ObjectId();
    const session = await mongoose.startSession();
    let result:
      { orderId: string; amountMinor: number; currency: string } | undefined;
    try {
      await session.withTransaction(async () => {
        const existing = await Order.findOne({
          ownerTokenHash,
          idempotencyKey: key,
        }).session(session);
        if (existing) {
          if (existing.requestHash !== requestHash)
            throw new RequestError(
              "This request key was used for different order details",
              409,
            );
          result = {
            orderId: String(existing._id),
            amountMinor: existing.amountMinor,
            currency: existing.currency,
          };
          return;
        }
        const items = [];
        for (const line of requested) {
          const { product, allocations } = await reserveProduct(
            line.sku,
            line.qty,
            `order:${orderId}`,
            session,
          );
          let unitPrice: number;
          try {
            unitPrice = resolveUnitPrice(product.prices, input.currency, fx);
          } catch {
            throw new RequestError(
              "Pricing is unavailable in this currency",
              503,
            );
          }
          if (!Number.isSafeInteger(unitPrice) || unitPrice <= 0)
            throw new RequestError("Product pricing unavailable", 409);
          items.push({
            sku: line.sku,
            name: product.name,
            qty: line.qty,
            unitPrice,
            allocations,
            taxCode: product.taxCode,
            fxTimestamp: product.prices[input.currency]
              ? undefined
              : fx?.timestamp,
          });
        }
        const subtotal = checkedTotal(items.map((i) => i.qty * i.unitPrice));
        const promotion = input.couponCode
          ? await reserveCoupon(
              input.couponCode,
              subtotal,
              input.currency,
              customer?.id,
              String(orderId),
              session,
            )
          : null;
        const discountMinor = promotion?.discount ?? 0,
          amountMinor = checkedTotal([subtotal - discountMinor, shipping]),
          discounts = allocateDiscount(
            items.map((i) => i.qty * i.unitPrice),
            discountMinor,
          );
        const pricedItems = items.map((i, index) => ({
          ...i,
          lineTotalMinor: i.qty * i.unitPrice - discounts[index],
        }));
        const [order] = await Order.create(
          [
            {
              _id: orderId,
              ownerTokenHash,
              customerId: customer?.id,
              idempotencyKey: key,
              requestHash,
              policyHash: createHash("sha256")
                .update(JSON.stringify(site.policy))
                .digest("hex"),
              consentedAt: new Date(),
              items: pricedItems,
              couponId: promotion?.couponId,
              discountMinor,
              currency: input.currency,
              subtotal,
              shipping,
              amountMinor,
              address: input.address,
              reservationExpiresAt: new Date(Date.now() + 65 * 60000),
            },
          ],
          { session },
        );
        result = {
          orderId: String(order._id),
          amountMinor,
          currency: order.currency,
        };
      });
    } catch (error) {
      // A simultaneous request can commit the unique key before this transaction.
      // Its losing transaction rolled back every stock decrement; replay the winner.
      if (
        error instanceof mongoose.mongo.MongoServerError &&
        error.code === 11000
      ) {
        const existing = await Order.findOne({
          ownerTokenHash,
          idempotencyKey: key,
        });
        if (!existing || existing.requestHash !== requestHash)
          throw new RequestError("Order request conflict", 409);
        result = {
          orderId: String(existing._id),
          amountMinor: existing.amountMinor,
          currency: existing.currency,
        };
      } else throw error;
    } finally {
      await session.endSession();
    }
    return NextResponse.json(result, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
