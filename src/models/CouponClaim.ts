import { Schema, model, models } from "mongoose";
const schema = new Schema(
  {
    _id: String,
    couponId: Schema.Types.ObjectId,
    customerId: Schema.Types.ObjectId,
    orderId: Schema.Types.ObjectId,
    status: { type: String, enum: ["reserved", "used", "released"] },
  },
  { timestamps: true },
);
export const CouponClaim = models.CouponClaim || model("CouponClaim", schema);
