import mongoose from "mongoose";
import { pathToFileURL } from "node:url";

// Add indexes only. Never drop collections, indexes, or migrate existing orders automatically.
export async function prepareIndexes(db) {
  await db
    .collection("returnrequests")
    .createIndex({ orderId: 1, requestId: 1 }, { unique: true });
  await db
    .collection("returnrequests")
    .createIndex({ status: 1, createdAt: -1 });
  await db
    .collection("refunds")
    .createIndex({ orderId: 1, requestId: 1 }, { unique: true });
  await db
    .collection("refunds")
    .createIndex({ providerId: 1 }, { unique: true, sparse: true });
  await db
    .collection("refunds")
    .createIndex({ providerReference: 1 }, { unique: true, sparse: true });
  await db.collection("refunds").createIndex({ status: 1, nextAttemptAt: 1 });
  await db
    .collection("shipments")
    .createIndex({ orderId: 1, warehouse: 1 }, { unique: true });
  await db.collection("shipments").createIndex({ status: 1, nextCheckAt: 1 });
  await db
    .collection("taxquotes")
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection("taxquotes").createIndex({ orderId: 1, createdAt: -1 });
  await db.collection("paymentdisputes").createIndex({ orderId: 1, status: 1 });
  await db
    .collection("products")
    .createIndex({ active: 1, "prices.USD": 1, sku: 1 });
  await db
    .collection("products")
    .createIndex({ active: 1, "prices.KES": 1, sku: 1 });

  await db
    .collection("warehouses")
    .updateOne(
      { _id: "default" },
      { $setOnInsert: { name: "Primary warehouse", active: true } },
      { upsert: true },
    );
  await db
    .collection("stockbalances")
    .createIndex({ sku: 1, warehouse: 1 }, { unique: true });
  await db.collection("stockmovements").createIndex({ sku: 1, createdAt: -1 });
  await db.collection("coupons").createIndex({ code: 1 }, { unique: true });
  await db
    .collection("products")
    .createIndex({ name: "text", description: "text", tags: "text" });
  await db
    .collection("products")
    .createIndex({ active: 1, featured: -1, sku: 1 });
  await db.collection("products").createIndex({ parentSku: 1, active: 1 });

  await db
    .collection("guards")
    .updateOne(
      { _id: "staff-roles" },
      { $setOnInsert: { version: 0 } },
      { upsert: true },
    );
  await db
    .collection("reviews")
    .createIndex({ sku: 1, customerId: 1 }, { unique: true });
  await db
    .collection("reviews")
    .createIndex({ sku: 1, status: 1, createdAt: -1 });
  await db
    .collection("supporttickets")
    .createIndex({ customerId: 1, createdAt: -1 });
  await db
    .collection("supporttickets")
    .createIndex({ status: 1, createdAt: -1 });

  await db.collection("customers").createIndex({ email: 1 }, { unique: true });
  await db
    .collection("customersessions")
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection("customersessions").createIndex({ customerId: 1 });
  await db
    .collection("authtokens")
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection("auditevents").createIndex({ createdAt: -1 });
  await db.collection("orders").createIndex({ customerId: 1, createdAt: -1 });

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
      "Database indexes and platform guard/default-warehouse records prepared.",
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
