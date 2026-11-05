import { Schema, model, models } from "mongoose";
const schema = new Schema(
  {
    _id: String,
    sku: String,
    kind: String,
    quantity: Number,
    allocations: [{ warehouse: String, qty: Number }],
    actor: String,
    requestHash: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
schema.index({ sku: 1, createdAt: -1 });
export const StockMovement =
  models.StockMovement || model("StockMovement", schema);
