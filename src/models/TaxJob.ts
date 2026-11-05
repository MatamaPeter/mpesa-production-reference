import { Schema, model, models } from "mongoose";
const schema = new Schema(
  {
    _id: String,
    orderId: Schema.Types.ObjectId,
    refundId: Schema.Types.ObjectId,
    calculationId: String,
    kind: {
      type: String,
      enum: ["transaction", "full_reversal", "partial_review"],
    },
    status: {
      type: String,
      enum: ["queued", "sending", "completed", "review"],
      default: "queued",
    },
    providerId: String,
    lockedUntil: Date,
    attempts: { type: Number, default: 0 },
    note: String,
    nextAttemptAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
export const TaxJob = models.TaxJob || model("TaxJob", schema);
