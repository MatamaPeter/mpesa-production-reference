import type { MetadataRoute } from "next";
import { connectDB } from "@/lib/db";
import { Product } from "@/models/Product";
import { indexingEnabled, publicOrigin } from "@/lib/seo";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = publicOrigin();
  if (!origin || !indexingEnabled()) return [];
  await connectDB();
  const products = await Product.find({ active: true })
    .select("slug updatedAt")
    .sort({ _id: 1 })
    .limit(49000)
    .lean();
  return [
    { url: origin, changeFrequency: "daily", priority: 1 },
    ...["about", "contact", "policies/shipping", "policies/returns"].map(
      (path) => ({
        url: `${origin}/${path}`,
        changeFrequency: "monthly" as const,
      }),
    ),
    ...products.map((p) => ({
      url: `${origin}/products/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
    })),
  ];
}
