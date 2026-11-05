import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { queueNotification } from "@/lib/notifications";
import { z } from "zod";
import { requirePermission, requireAdmin } from "@/lib/admin";
import { checkOrigin } from "@/lib/checkout-auth";
import { connectDB } from "@/lib/db";
import { Order } from "@/models/Order";
import { apiError, readJSON, RequestError } from "@/lib/http";
export async function GET(req: NextRequest) {
  try {
    await requirePermission("orders.read");
    await connectDB();
    const cursor = req.nextUrl.searchParams.get("cursor"),
      orderId = req.nextUrl.searchParams.get("orderId");
    if (
      (cursor && !/^[a-f0-9]{24}$/i.test(cursor)) ||
      (orderId && !/^[a-f0-9]{24}$/i.test(orderId))
    )
      throw new RequestError("Invalid order reference");
    const orders = await Order.find({
      ...(cursor ? { _id: { $lt: cursor } } : {}),
      ...(orderId ? { _id: orderId } : {}),
    })
      .sort({ _id: -1 })
      .limit(51)
      .select(
        "items currency amountMinor totalPaidMinor refundedMinor refundReservedMinor paymentHold disputeStatus status fulfillment trackingNumber address createdAt",
      )
      .lean();
    return NextResponse.json(
      {
        items: orders.slice(0, 50),
        nextCursor: orders.length > 50 ? String(orders[49]._id) : null,
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    await requirePermission("orders.fulfill");
    const parsed = z
      .object({
        orderId: z.string().regex(/^[a-f0-9]{24}$/i),
        fulfillment: z.enum(["processing", "shipped", "delivered"]),
        trackingNumber: z.string().trim().max(160),
      })
      .safeParse(await readJSON(req));
    if (!parsed.success) throw new RequestError("Invalid fulfillment update");
    const { orderId, fulfillment, trackingNumber } = parsed.data;
    if (fulfillment !== "processing" && !trackingNumber)
      throw new RequestError("A tracking reference is required");
    const previous = {
      processing: "unfulfilled",
      shipped: "processing",
      delivered: "shipped",
    }[fulfillment];
    await connectDB();

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const order = await Order.findOneAndUpdate(
          {
            _id: orderId,
            status: "paid",
            paymentHold: { $ne: true },
            fulfillment: previous,
          },
          {
            $set: {
              fulfillment,
              trackingNumber,
              ...(fulfillment === "delivered"
                ? { deliveredAt: new Date() }
                : {}),
            },
          },
          { session, returnDocument: "after" },
        );
        if (!order)
          throw new RequestError(
            "Only paid orders can advance one fulfillment step at a time",
            409,
          );
        await queueNotification(order, "fulfillment", session);
      });
    } finally {
      await session.endSession();
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
