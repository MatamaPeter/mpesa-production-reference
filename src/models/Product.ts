import { Schema, model, models } from "mongoose";
const schema = new Schema(
  {
    sku: { type: String, required: true, unique: true },
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    tagline: String,
    description: String,
    prices: {
      USD: { type: Number, required: true, min: 1 },
      KES: { type: Number, required: true, min: 100 },
    },
    image: { type: String, required: true },
    features: [String],
    stock: { type: Number, required: true, default: 0, min: 0 },
    active: { type: Boolean, default: false },
    featured: { type: Boolean, default: false },
  },
  { timestamps: true },
);
export const Product = models.Product || model("Product", schema);
