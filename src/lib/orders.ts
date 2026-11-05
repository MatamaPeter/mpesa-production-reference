import { releaseCoupon } from "./coupons";
import { returnInventory } from "./inventory";
import "server-only";
import mongoose, { type ClientSession } from "mongoose";
import { Order } from "@/models/Order";
import { Product } from "@/models/Product";
export async function releaseStock(orderId: string, session: ClientSession) {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, status: "unpaid", stockReleased: false },
    { $set: { status: "cancelled", stockReleased: true } },
    { session, returnDocument: "before" },
  );
  if (!order) return;
  await releaseCoupon(order, session);
  await returnInventory(order.items, `order:${orderId}`, session);
}
export async function cancelOrder(orderId: string) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(() => releaseStock(orderId, session));
  } finally {
    await session.endSession();
  }
}
