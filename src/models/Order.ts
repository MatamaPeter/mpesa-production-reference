import { Schema, model, models, Types } from "mongoose";
const address = new Schema(
  {
    name: String,
    email: String,
    phone: String,
    line1: String,
    line2: String,
    city: String,
    region: String,
    postalCode: String,
    country: String,
  },
  { _id: false },
);
const schema = new Schema(
  {
    ownerTokenHash: { type: String, required: true, index: true },
    idempotencyKey: { type: String, required: true },
    requestHash: { type: String, required: true },
    items: [
      {
        sku: { type: String, required: true },
        name: String,
        qty: Number,
        unitPrice: Number,
      },
    ],
    currency: { type: String, enum: ["USD", "KES"], required: true },
    subtotal: { type: Number, required: true },
    shipping: { type: Number, required: true },
    amountMinor: { type: Number, required: true, min: 1 },
    taxMinor: Number,
    totalPaidMinor: Number,
    amount: { type: Number, min: 1 },
    address: { type: address, required: true },
    status: {
      type: String,
      enum: ["unpaid", "paid", "cancelled", "review"],
      default: "unpaid",
      index: true,
    },
    fulfillment: {
      type: String,
      enum: ["unfulfilled", "processing", "shipped", "delivered"],
      default: "unfulfilled",
    },
    trackingNumber: { type: String, default: "" },
    activePaymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },
    stripeSessionId: String,
    stripeSessionUrl: String,
    paymentMethod: { type: String, enum: ["stripe", "mpesa"] },
    reservationExpiresAt: { type: Date, required: true, index: true },
    stockReleased: { type: Boolean, default: false },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true },
);
schema.index(
  { ownerTokenHash: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  },
);
schema.index({ stripeSessionId: 1 }, { unique: true, sparse: true });
export type OrderDoc = {
  _id: Types.ObjectId;
  ownerTokenHash: string;
  amount: number;
  status: string;
  activePaymentId: Types.ObjectId | null;
};
export const Order = models.Order || model("Order", schema);
