import { Schema, model, models } from "mongoose";
export const Warehouse =
  models.Warehouse ||
  model(
    "Warehouse",
    new Schema(
      {
        _id: String,
        name: String,
        active: { type: Boolean, default: true },
        address: Schema.Types.Mixed,
      },
      { timestamps: true },
    ),
  );
