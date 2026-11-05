import { Schema, model, models } from "mongoose";
const PaymentSchema = new Schema(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    phone: { type: String, required: true },
    amount: { type: Number, required: true },
    reference: { type: String, required: true },
    status: {
      type: String,
      enum: ["initiating", "pending", "success", "failed", "review"],
      default: "initiating",
      index: true,
    },
    checkoutRequestId: { type: String, unique: true, sparse: true },
    merchantRequestId: String,
    callbackPayload: Schema.Types.Mixed,
    receipt: { type: String, unique: true, sparse: true },
    resultCode: Number,
    resultDescription: String,
    queriedAt: Date,
    nextCheckAt: { type: Date, index: true },
    attemptCount: { type: Number, default: 0 },
    lockedUntil: Date,
  },
  { timestamps: true },
);
PaymentSchema.index({ status: 1, nextCheckAt: 1 });
export const Payment = models.Payment || model("Payment", PaymentSchema);
