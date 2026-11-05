import { Schema, model, models } from "mongoose";
const schema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    requestId: { type: String, required: true },
    amountMinor: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true },
    provider: { type: String, enum: ["stripe", "manual"], required: true },
    paymentIntent: String,
    status: {
      type: String,
      enum: [
        "queued",
        "sending",
        "pending",
        "awaiting_manual",
        "succeeded",
        "failed",
        "review",
      ],
      required: true,
    },
    providerId: { type: String, unique: true, sparse: true },
    providerReference: { type: String, unique: true, sparse: true },
    reason: String,
    createdBy: String,
    confirmedBy: String,
    lockedUntil: Date,
    nextAttemptAt: Date,
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);
schema.index({ orderId: 1, requestId: 1 }, { unique: true });
schema.index({ status: 1, nextAttemptAt: 1 });
export const Refund = models.Refund || model("Refund", schema);
