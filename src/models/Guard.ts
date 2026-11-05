import { Schema, model, models } from "mongoose";
export const Guard =
  models.Guard ||
  model(
    "Guard",
    new Schema({ _id: String, version: { type: Number, default: 0 } }),
  );
