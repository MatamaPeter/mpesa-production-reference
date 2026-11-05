import mongoose from "mongoose";
import { pathToFileURL } from "node:url";

// Add indexes only. Never drop collections, indexes, or migrate existing orders automatically.
export async function prepareIndexes(db) {
  await db.collection("products").createIndex({ sku: 1 }, { unique: true });
  await db.collection("products").createIndex({ slug: 1 }, { unique: true });
  await db.collection("orders").createIndex(
    { ownerTokenHash: 1, idempotencyKey: 1 },
    {
      unique: true,
      partialFilterExpression: { idempotencyKey: { $type: "string" } },
    },
  );
  await db
    .collection("orders")
    .createIndex({ stripeSessionId: 1 }, { unique: true, sparse: true });
  await db.collection("orders").createIndex({ ownerTokenHash: 1 });
  await db
    .collection("orders")
    .createIndex({ status: 1, reservationExpiresAt: 1 });
  await db
    .collection("payments")
    .createIndex({ checkoutRequestId: 1 }, { unique: true, sparse: true });
  await db
    .collection("payments")
    .createIndex({ receipt: 1 }, { unique: true, sparse: true });
  await db.collection("payments").createIndex({ orderId: 1 });
  await db.collection("payments").createIndex({ status: 1, nextCheckAt: 1 });
  await db
    .collection("callbackinboxes")
    .createIndex({ checkoutRequestId: 1 }, { unique: true });
  await db
    .collection("emailoutboxes")
    .createIndex({ eventKey: 1 }, { unique: true });
  await db
    .collection("emailoutboxes")
    .createIndex({ status: 1, nextAttemptAt: 1 });
  await db
    .collection("ratelimits")
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
    await mongoose.connect(process.env.MONGODB_URI, {
      autoIndex: false,
      serverSelectionTimeoutMS: 10000,
    });
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== "isdbgrid")
      throw new Error("A replica set or sharded cluster is required");
    await prepareIndexes(mongoose.connection.db);
    console.log(
      "Database indexes prepared. No application records were changed.",
    );
  } catch (e) {
    console.error(
      "Database preparation failed:",
      e?.code === 11000
        ? "Existing duplicate data requires an explicit migration."
        : (e?.name ?? "Error"),
    );
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
