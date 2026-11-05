import mongoose from "mongoose";
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI missing");
const globalMongoose = globalThis as typeof globalThis & { __mongoose?: Promise<typeof mongoose> };
export async function connectDB() {
  if (!globalMongoose.__mongoose) {
    globalMongoose.__mongoose = mongoose.connect(uri!, { serverSelectionTimeoutMS: 10000 }).catch(e => {globalMongoose.__mongoose = undefined; throw e;});
  }
  return globalMongoose.__mongoose;
}
