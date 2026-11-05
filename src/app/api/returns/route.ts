import { digest } from "@/lib/security";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { site } from "@/config/site";
import { orderAccess, currentCustomer } from "@/lib/customer-auth";
import { checkOrigin, checkoutIdentity } from "@/lib/checkout-auth";
import { Order } from "@/models/Order";
import { ReturnRequest } from "@/models/ReturnRequest";
import { connectDB } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { apiError, readJSON, RequestError } from "@/lib/http";
export async function GET() {
  try {
    const access = await orderAccess();
    if (!access)
      throw new RequestError(
        "Sign in or use the browser that placed your order",
        401,
      );
    await connectDB();
    const orders = await Order.find(access).select("_id").limit(500).lean();
    return NextResponse.json({
      items: await ReturnRequest.find({
        orderId: { $in: orders.map((o) => o._id) },
      })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    if (!site.features.returns)
      throw new RequestError("Returns are not enabled", 503);
    const access = await orderAccess(),
      user = await currentCustomer(),
      guest = await checkoutIdentity();
    if (!access) throw new RequestError("Session required", 401);
    const input = z
      .object({
        orderId: z.string().regex(/^[a-f0-9]{24}$/i),
        requestId: z.string().uuid(),
        items: z
          .array(
            z
              .object({
                sku: z.string().regex(/^[a-z0-9-]{1,80}$/),
                qty: z.number().int().min(1).max(10),
              })
              .strict(),
          )
          .min(1)
          .max(20),
        reason: z.string().trim().min(10).max(3000),
      })
      .strict()
      .safeParse(await readJSON(req));
    if (
      !input.success ||
      new Set(input.data.items.map((i) => i.sku)).size !==
        input.data.items.length
    )
      throw new RequestError("Check the return items and reason");
    await rateLimit("returns", user?.id ?? guest!, 10, 3600000);
    const session = await mongoose.startSession();
    let id = "";
    try {
      await session.withTransaction(async () => {
        const order = await Order.findOneAndUpdate(
          {
            _id: input.data.orderId,
            ...access,
            status: "paid",
            fulfillment: "delivered",
            deliveredAt: {
              $gte: new Date(
                Date.now() - site.policy.returnWindowDays * 86400000,
              ),
            },
          },
          { $inc: { returnVersion: 1 } },
          { session, returnDocument: "after" },
        );
        if (!order)
          throw new RequestError(
            "This order is not eligible for self-service returns. Contact support for help.",
            409,
          );
        const existing = await ReturnRequest.findOne({
          orderId: order._id,
          requestId: input.data.requestId,
        }).session(session);
        if (existing) {
          if (existing.requestHash !== digest(JSON.stringify(input.data)))
            throw new RequestError(
              "This request key was used for different return details",
              409,
            );
          id = String(existing._id);
          return;
        }
        const requests = await ReturnRequest.find({
          orderId: order._id,
          status: { $ne: "rejected" },
        }).session(session);
        for (const line of input.data.items) {
          const purchased =
              order.items.find((i: { sku: string }) => i.sku === line.sku)
                ?.qty ?? 0,
            claimed = requests.reduce(
              (n, r) =>
                n +
                (r.items.find((i: { sku: string }) => i.sku === line.sku)
                  ?.qty ?? 0),
              0,
            );
          if (line.qty + claimed > purchased)
            throw new RequestError(
              "Return quantity exceeds the remaining purchased quantity",
              409,
            );
        }
        const [record] = await ReturnRequest.create(
          [{ customerId: user?.id, ownerTokenHash: guest, ...input.data }],
          { session },
        );
        id = String(record._id);
      });
    } finally {
      await session.endSession();
    }
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
