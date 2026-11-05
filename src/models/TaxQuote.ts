import { Schema, model, models } from "mongoose";
const schema = new Schema(
  {
    _id: String,
    orderId: Schema.Types.ObjectId,
    calculationId: String,
    amountMinor: Number,
    taxMinor: Number,
    totalMinor: Number,
    roundingMinor: Number,
    expiresAt: Date,
  },
  { timestamps: true },
);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const TaxQuote = models.TaxQuote || model("TaxQuote", schema);
