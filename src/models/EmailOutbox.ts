import { Schema, model, models } from "mongoose";
const schema = new Schema(
  {
    eventKey: { type: String, required: true, unique: true },
    to: { type: String, required: true },
    subject: { type: String, required: true },
    text: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "sending", "sent", "review"],
      default: "pending",
    },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    lockedUntil: Date,
    providerId: String,
    sentAt: Date,
  },
  { timestamps: true },
);
schema.index({ status: 1, nextAttemptAt: 1 });
export const EmailOutbox = models.EmailOutbox || model("EmailOutbox", schema);
