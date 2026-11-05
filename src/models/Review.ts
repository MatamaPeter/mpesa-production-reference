import { Schema, model, models } from "mongoose";
const schema = new Schema(
  {
    sku: { type: String, required: true, index: true },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    displayName: String,
    rating: { type: Number, min: 1, max: 5, required: true },
    title: String,
    body: String,
    verifiedPurchase: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true },
);
schema.index({ sku: 1, customerId: 1 }, { unique: true });
schema.index({ sku: 1, status: 1, createdAt: -1 });
export const Review = models.Review || model("Review", schema);
