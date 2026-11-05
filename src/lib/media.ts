import "server-only";
import mongoose from "mongoose";
import { GridFSBucket, ObjectId } from "mongodb";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { site } from "@/config/site";
export function mediaS3() {
  const endpoint = process.env.S3_ENDPOINT;
  if (endpoint) {
    const url = new URL(endpoint);
    if (url.protocol !== "https:")
      throw new Error("S3 endpoint must use HTTPS");
  }
  return new S3Client({
    region: process.env.S3_REGION ?? "auto",
    endpoint,
    forcePathStyle: !!endpoint,
    credentials:
      process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
          }
        : undefined,
  });
}
export function mediaBucket() {
  if (!mongoose.connection.db) throw new Error("Database unavailable");
  return new GridFSBucket(mongoose.connection.db, {
    bucketName: "productmedia",
  });
}
export async function saveMedia(id: string, body: Buffer) {
  const storage = process.env.MEDIA_STORAGE === "s3" ? "s3" : "gridfs",
    objectKey = `${site.id}/products/${id}.webp`;
  if (storage === "s3") {
    if (!process.env.S3_BUCKET) throw new Error("S3_BUCKET required");
    await mediaS3().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: objectKey,
        Body: body,
        ContentType: "image/webp",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return { storage, objectKey };
  }
  const stream = mediaBucket().openUploadStream(id, {
    metadata: { contentType: "image/webp" },
  });
  await new Promise<void>((resolve, reject) => {
    stream.once("error", reject);
    stream.once("finish", () => resolve());
    stream.end(body);
  });
  return { storage, fileId: stream.id, objectKey };
}
export async function removeMedia(location: {
  storage: string;
  objectKey: string;
  fileId?: ObjectId;
}) {
  if (location.storage === "s3")
    await mediaS3().send(
      new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: location.objectKey,
      }),
    );
  else if (location.fileId) await mediaBucket().delete(location.fileId);
}
export async function readMedia(location: {
  storage: string;
  objectKey: string;
  fileId?: ObjectId;
}) {
  if (location.storage === "s3") {
    const response = await mediaS3().send(
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: location.objectKey,
      }),
    );
    if (!response.Body) throw new Error("Asset missing");
    return Buffer.from(await response.Body.transformToByteArray());
  }
  if (!location.fileId) throw new Error("Asset missing");
  const chunks: Buffer[] = [];
  for await (const chunk of mediaBucket().openDownloadStream(location.fileId))
    chunks.push(chunk);
  return Buffer.concat(chunks);
}
