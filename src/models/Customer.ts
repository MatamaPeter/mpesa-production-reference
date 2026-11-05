import { Schema, model, models } from "mongoose";
const address = new Schema(
  {
    label: String,
    name: String,
    phone: String,
    line1: String,
    line2: String,
    city: String,
    region: String,
    postalCode: String,
    country: String,
  },
  { _id: true },
);
const schema = new Schema(
  {
    email: { type: String, required: true, unique: true },
    name: { type: String, default: "" },
    role: {
      type: String,
      enum: ["customer", "owner", "manager", "support", "warehouse", "finance"],
      default: "customer",
    },
    verifiedAt: Date,
    disabled: { type: Boolean, default: false },
    addresses: { type: [address], default: [] },
    wishlist: { type: [String], default: [] },
    totpSecret: { type: String, select: false },
    totpPending: { type: String, select: false },
    totpPendingUntil: Date,
    totpLastCounter: { type: Number, default: -1 },
    recoveryHashes: { type: [String], select: false },
  },
  { timestamps: true },
);
export const Customer = models.Customer || model("Customer", schema);
