import { Schema, model, models } from "mongoose";
const schema = new Schema(
  {
    sku: { type: String, required: true },
    warehouse: { type: String, required: true },
    available: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);
schema.index({ sku: 1, warehouse: 1 }, { unique: true });
export const StockBalance =
  models.StockBalance || model("StockBalance", schema);
