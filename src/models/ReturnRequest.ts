import { Schema, model, models } from "mongoose";
const schema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    requestId: { type: String, required: true },
    customerId: Schema.Types.ObjectId,
    ownerTokenHash: String,
    items: [{ sku: String, qty: Number }],
    reason: String,
    requestHash: String,
    status: {
      type: String,
      enum: [
        "requested",
        "approved",
        "in_transit",
        "received",
        "closed",
        "rejected",
      ],
      default: "requested",
    },
    trackingReference: String,
    operatorNote: String,
    restocked: { type: Boolean, default: false },
  },
  { timestamps: true },
);
schema.index({ orderId: 1, requestId: 1 }, { unique: true });
schema.index({ status: 1, createdAt: -1 });
export const ReturnRequest =
  models.ReturnRequest || model("ReturnRequest", schema);
