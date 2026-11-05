import { Schema, model, models } from "mongoose";
const schema = new Schema(
  {
    checkoutRequestId: { type: String, required: true, unique: true },
    merchantRequestId: { type: String, required: true },
    payload: Schema.Types.Mixed,
  },
  { timestamps: true },
);
export const CallbackInbox =
  models.CallbackInbox || model("CallbackInbox", schema);
