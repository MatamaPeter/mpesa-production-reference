import { Schema, model, models } from "mongoose";
const schema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    kind: { type: String, enum: ["percent", "fixed"], required: true },
    value: { type: Number, required: true },
    currency: String,
    minimumSubtotal: { type: Number, default: 0 },
    maxDiscount: Number,
    maxUses: { type: Number, required: true },
    reservedUses: { type: Number, default: 0 },
    usedUses: { type: Number, default: 0 },
    requireAccount: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
  },
  { timestamps: true },
);
export const Coupon = models.Coupon || model("Coupon", schema);
