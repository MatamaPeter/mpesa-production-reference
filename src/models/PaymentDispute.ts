import { Schema, model, models } from "mongoose";
const schema = new Schema(
  {
    _id: String,
    orderId: Schema.Types.ObjectId,
    amountMinor: Number,
    currency: String,
    status: String,
    reason: String,
    providerUpdatedAt: Date,
  },
  { timestamps: true },
);
schema.index({ orderId: 1, status: 1 });
export const PaymentDispute =
  models.PaymentDispute || model("PaymentDispute", schema);
