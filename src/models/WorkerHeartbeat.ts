import { Schema, model, models } from "mongoose";
export const WorkerHeartbeat =
  models.WorkerHeartbeat ||
  model(
    "WorkerHeartbeat",
    new Schema(
      { _id: String, lastRunAt: Date, lastResult: Schema.Types.Mixed },
      { timestamps: true },
    ),
  );
