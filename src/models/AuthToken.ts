import { Schema, model, models } from "mongoose";
const schema = new Schema(
  {
    _id: String,
    email: { type: String, required: true },
    name: { type: String, default: "" },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
  },
  { timestamps: true },
);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const AuthToken = models.AuthToken || model("AuthToken", schema);
