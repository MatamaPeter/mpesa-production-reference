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
    const parsed = orderSchema.safeParse(await readJSON(req));
    if (!parsed.success)
      throw new RequestError("Please check your items and delivery details");
    const key = req.headers.get("idempotency-key");
    if (!key || !/^[a-zA-Z0-9-]{16,80}$/.test(key))
      throw new RequestError("A valid idempotency key is required");
    const ownerTokenHash = await checkoutIdentity(true);
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
          const product = await Product.findOneAndUpdate(
            { sku: line.sku, active: true, stock: { $gte: line.qty } },
            { $inc: { stock: -line.qty } },
            { session, returnDocument: "after" },
          );
          if (!product)
            throw new RequestError(
              "An item is unavailable or has insufficient stock",
              409,
            );
          const unitPrice = product.prices[input.currency];
          if (!Number.isSafeInteger(unitPrice) || unitPrice <= 0)
            throw new RequestError("Product pricing unavailable", 409);
          items.push({
            sku: line.sku,
            name: product.name,
            qty: line.qty,
            unitPrice,
          });
        }
        const subtotal = checkedTotal(items.map((i) => i.qty * i.unitPrice)),
          amountMinor = checkedTotal([subtotal, shipping]);
        const [order] = await Order.create(
          [
            {
              ownerTokenHash,
              idempotencyKey: key,
              requestHash,
              items,
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
