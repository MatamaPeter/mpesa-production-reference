import { site } from "@/config/site";
import "server-only";
import type { ClientSession } from "mongoose";
import { Coupon } from "@/models/Coupon";
import { CouponClaim } from "@/models/CouponClaim";
import { Order } from "@/models/Order";
import { discountAmount } from "./discounts";
import { RequestError } from "./http";
export async function reserveCoupon(
  code: string,
  subtotal: number,
  currency: string,
  customerId: string | undefined,
  orderId: string,
  session: ClientSession,
) {
  if (!site.features.coupons)
    throw new RequestError("Promotions are disabled", 503);
  const coupon = await Coupon.findOneAndUpdate(
    {
      code,
      active: true,
      startsAt: { $lte: new Date() },
      endsAt: { $gt: new Date() },
      $expr: { $lt: [{ $add: ["$usedUses", "$reservedUses"] }, "$maxUses"] },
    },
    { $inc: { reservedUses: 1 } },
    { session, returnDocument: "after" },
  );
  if (!coupon)
    throw new RequestError(
      "This promotion is unavailable or has reached its limit",
      409,
    );
  if (coupon.requireAccount && !customerId)
    throw new RequestError("Sign in to use this promotion", 401);
  let discount: number;
  try {
    discount = discountAmount(subtotal, currency, coupon);
  } catch (e) {
    throw new RequestError(
      e instanceof Error ? e.message : "Promotion unavailable",
    );
  }
  if (coupon.requireAccount) {
    const id = `${coupon._id}:${customerId}`,
      claim = await CouponClaim.findById(id).session(session);
    if (claim && claim.status !== "released")
      throw new RequestError(
        "This account already used or reserved this promotion",
        409,
      );
    await CouponClaim.updateOne(
      { _id: id },
      {
        $set: { couponId: coupon._id, customerId, orderId, status: "reserved" },
      },
      { upsert: true, session },
    );
  }
  return { discount, couponId: coupon._id };
}
export async function releaseCoupon(
  order: {
    _id: unknown;
    couponId?: unknown;
    couponRedeemed?: boolean;
    couponReleased?: boolean;
  },
  session: ClientSession,
) {
  if (!order.couponId || order.couponRedeemed || order.couponReleased) return;
  await Coupon.updateOne(
    { _id: order.couponId, reservedUses: { $gt: 0 } },
    { $inc: { reservedUses: -1 } },
    { session },
  );
  await CouponClaim.updateOne(
    { orderId: order._id, status: "reserved" },
    { $set: { status: "released" } },
    { session },
  );
  await Order.updateOne(
    { _id: order._id },
    { $set: { couponReleased: true } },
    { session },
  );
}
export async function redeemCoupon(
  order: {
    _id: unknown;
    couponId?: unknown;
    couponRedeemed?: boolean;
    couponReleased?: boolean;
  },
  session: ClientSession,
) {
  if (!order.couponId || order.couponRedeemed || order.couponReleased) return;
  const result = await Coupon.updateOne(
    { _id: order.couponId, reservedUses: { $gt: 0 } },
    { $inc: { reservedUses: -1, usedUses: 1 } },
    { session },
  );
  if (!result.modifiedCount) throw new Error("Promotion reservation missing");
  await CouponClaim.updateOne(
    { orderId: order._id, status: "reserved" },
    { $set: { status: "used" } },
    { session },
  );
  await Order.updateOne(
    { _id: order._id },
    { $set: { couponRedeemed: true } },
    { session },
  );
}
