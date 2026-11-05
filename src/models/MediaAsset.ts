import { Schema, model, models } from "mongoose";
const schema = new Schema(
  {
    _id: String,
    storage: { type: String, enum: ["gridfs", "s3"] },
    objectKey: String,
    fileId: Schema.Types.ObjectId,
    checksum: String,
    size: Number,
    width: Number,
    height: Number,
    createdBy: String,
  },
  { timestamps: true },
);
export const MediaAsset = models.MediaAsset || model("MediaAsset", schema);
