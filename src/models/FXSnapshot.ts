import { Schema, model, models } from "mongoose";
export const FXSnapshot =
  models.FXSnapshot ||
  model(
    "FXSnapshot",
    new Schema(
      { _id: String, timestamp: Number, rates: Schema.Types.Mixed },
      { timestamps: true },
    ),
  );
