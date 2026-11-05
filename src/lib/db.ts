import mongoose from "mongoose";
const cache = globalThis as typeof globalThis & {
  __mongoose?: Promise<typeof mongoose>;
};
export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Database is not configured");
  if (!cache.__mongoose)
    cache.__mongoose = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: 10000,
        maxPoolSize: Math.min(
          500,
          Math.max(5, Number(process.env.DB_POOL_SIZE) || 100),
        ),
        waitQueueTimeoutMS: 5000,
        socketTimeoutMS: 20000,
        maxIdleTimeMS: 60000,
        autoIndex: false,
      })
      .catch((e) => {
        cache.__mongoose = undefined;
        throw e;
      });
  return cache.__mongoose;
}
