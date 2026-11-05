import { Schema, model, models } from "mongoose";
const message = new Schema(
  {
    from: { type: String, enum: ["customer", "staff"] },
    body: String,
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);
const schema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
    ownerTokenHash: String,
    name: String,
    email: String,
    topic: String,
    subject: String,
    messages: { type: [message], default: [] },
    status: {
      type: String,
      enum: ["open", "pending", "resolved"],
      default: "open",
    },
  },
  { timestamps: true },
);
schema.index({ customerId: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });
export const SupportTicket =
  models.SupportTicket || model("SupportTicket", schema);
