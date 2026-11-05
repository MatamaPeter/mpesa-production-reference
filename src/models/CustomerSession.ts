import { Schema, model, models } from "mongoose";
const schema = new Schema(
  {
    _id: String,
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    expiresAt: { type: Date, required: true },
    mfaAt: Date,
    revokedAt: Date,
  },
  { timestamps: true },
);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const CustomerSession =
  models.CustomerSession || model("CustomerSession", schema);
