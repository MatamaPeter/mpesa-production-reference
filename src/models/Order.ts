import { Schema, model, models, Types } from "mongoose";
const OrderSchema = new Schema({
  ownerTokenHash: { type: String, required: true, index: true },
  items: [{ sku: { type: String, required: true }, name: String, qty: Number, unitPriceKES: Number }],
  amount: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ["unpaid", "paid", "cancelled"], default: "unpaid", index: true },
  activePaymentId: { type: Schema.Types.ObjectId, ref: "Payment", default: null },
  paidAt: { type: Date, default: null },
}, { timestamps: true });
export type OrderDoc = { _id: Types.ObjectId; ownerTokenHash: string; amount: number; status: string; activePaymentId: Types.ObjectId | null };
export const Order = models.Order || model("Order", OrderSchema);
