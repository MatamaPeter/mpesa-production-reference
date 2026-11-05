import "server-only";
import { createHash } from "node:crypto";
import { connectDB } from "./db";
import { RateLimit } from "@/models/RateLimit";
import { RequestError } from "./http";
export async function rateLimit(
  scope: string,
  identity: string,
  limit: number,
  windowMs = 60000,
) {
  await connectDB();
  const bucket = Math.floor(Date.now() / windowMs),
    hash = createHash("sha256").update(identity).digest("hex");
  const row = await RateLimit.findOneAndUpdate(
    { _id: `${scope}:${hash}:${bucket}` },
    {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date((bucket + 2) * windowMs) },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (row.count > limit)
    throw new RequestError(
      "Too many requests. Please wait before trying again.",
      429,
    );
}
