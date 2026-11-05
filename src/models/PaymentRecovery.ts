import { Schema, model, models } from "mongoose";
const schema = new Schema(
  {
    paymentId: { type: Schema.Types.ObjectId, required: true },
    requestedBy: String,
    confirmedBy: String,
    proofReference: String,
    note: String,
    status: {
      type: String,
      enum: ["requested", "cancelled", "released"],
      default: "requested",
    },
  },
  { timestamps: true },
);
schema.index({ paymentId: 1, status: 1 });
export const PaymentRecovery =
  models.PaymentRecovery || model("PaymentRecovery", schema);
