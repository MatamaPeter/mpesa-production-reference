import "server-only";
import { connectDB } from "./db";
import { Product } from "@/models/Product";
import { draftProducts, type ProductData } from "./catalog";
import { commerceEnabled } from "./store";
export async function getProducts(): Promise<ProductData[]> {
  if (!commerceEnabled()) return draftProducts;
  await connectDB();
  const rows = await Product.find({ active: true })
    .sort({ featured: -1, name: 1 })
    .lean();
  return rows.map((p) => ({
    sku: p.sku,
    slug: p.slug,
    name: p.name,
    category: p.category,
    tagline: p.tagline ?? "",
    description: p.description ?? "",
    prices: { USD: p.prices.USD, KES: p.prices.KES },
    image: p.image,
    features: p.features,
    stock: p.stock,
    active: p.active,
    featured: p.featured,
  }));
}
