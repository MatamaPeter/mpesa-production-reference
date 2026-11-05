import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { queueNotification } from "@/lib/notifications";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { checkOrigin } from "@/lib/checkout-auth";
import { connectDB } from "@/lib/db";
import { Order } from "@/models/Order";
import { apiError, readJSON, RequestError } from "@/lib/http";
export async function GET() {
  try {
    await requireAdmin();
    await connectDB();
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .select(
        "items currency amountMinor status fulfillment trackingNumber address createdAt",
      )
      .lean();
    return NextResponse.json(orders, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    await requireAdmin();
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
          { _id: orderId, status: "paid", fulfillment: previous },
          { $set: { fulfillment, trackingNumber } },
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
