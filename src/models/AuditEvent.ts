import { Schema, model, models } from "mongoose";
const schema = new Schema(
  {
    actor: { type: String, required: true },
    action: { type: String, required: true },
    resource: { type: String, required: true },
    details: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
schema.index({ createdAt: -1 });
export const AuditEvent = models.AuditEvent || model("AuditEvent", schema);
