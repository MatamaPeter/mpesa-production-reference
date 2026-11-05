import { cacheScope, catalogTag } from "./cache-scope";
import { exchangeSnapshot, unitPrice } from "./exchange";
import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { connectDB } from "./db";
import { Product } from "@/models/Product";
import { draftProducts, type ProductData } from "./catalog";
import { commerceEnabled } from "./store";
import { site } from "@/config/site";
export function publicProduct(p: Record<string, any>): ProductData {
  return {
    sku: p.sku,
    brand: p.brand,
    gtin: p.gtin,
    mpn: p.mpn,
    condition: p.condition,
    slug: p.slug,
    name: p.name,
    category: p.category,
    tagline: p.tagline ?? "",
    description: p.description ?? "",
    prices: { ...p.prices },
    image: p.image,
    features: p.features ?? [],
    stock: p.stock,
    active: p.active,
    featured: p.featured,
    parentSku: p.parentSku,
    attributes: (p.attributes ?? []).map(
      (a: { name: string; value: string }) => ({
        name: a.name,
        value: a.value,
      }),
    ),
    specifications: (p.specifications ?? []).map(
      (a: { name: string; value: string }) => ({
        name: a.name,
        value: a.value,
      }),
    ),
    images: p.images ?? [],
    tags: p.tags ?? [],
    taxCode: p.taxCode,
    weightGrams: p.weightGrams,
  };
}
export type CatalogQuery = {
  query?: string;
  category?: string;
  sort?: string;
  currency?: string;
  page?: number;
  min?: number;
  max?: number;
  inStock?: boolean;
};
const cachedCatalog = unstable_cache(
  async (input: CatalogQuery) => {
    await connectDB();
    const filter: Record<string, unknown> = { active: true };
    if (input.category && input.category !== "All")
      filter.category = input.category;
    if (input.inStock) filter.stock = { $gt: 0 };
    if (input.query) filter.$text = { $search: input.query };
    const currency = input.currency ?? site.locale.defaultCurrency,
      priceField = `${site.fx.enabled ? "marketPrices" : "prices"}.${currency}`;
    if (input.min !== undefined || input.max !== undefined)
      filter[priceField] = {
        ...(input.min !== undefined ? { $gte: input.min } : {}),
        ...(input.max !== undefined ? { $lte: input.max } : {}),
      };
    const sort: Record<string, 1 | -1> =
      input.sort === "price-low"
        ? { [priceField]: 1, sku: 1 }
        : input.sort === "price-high"
          ? { [priceField]: -1, sku: 1 }
          : { featured: -1, sku: 1 };
    const page = input.page ?? 1,
      [rows, total] = await Promise.all([
        Product.find(filter)
          .sort(sort)
          .skip((page - 1) * 24)
          .limit(24)
          .lean(),
        Product.countDocuments(filter),
      ]);
    return {
      items: await priceProducts(rows.map(publicProduct)),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / 24)),
    };
  },
  [cacheScope, "catalog-v3"],
  { revalidate: 60, tags: [catalogTag] },
);
export async function getCatalog(input: CatalogQuery = {}) {
  if (commerceEnabled()) return cachedCatalog(input);
  let rows = draftProducts.filter(
    (p) =>
      (!input.category ||
        input.category === "All" ||
        p.category === input.category) &&
      (!input.query ||
        `${p.name} ${p.category} ${p.tagline}`
          .toLowerCase()
          .includes(input.query.toLowerCase())) &&
      (!input.inStock || p.stock > 0),
  );
  const c = input.currency ?? "USD";
  rows = rows.filter(
    (p) =>
      (input.min === undefined || p.prices[c] >= input.min) &&
      (input.max === undefined || p.prices[c] <= input.max),
  );
  rows.sort((a, b) =>
    input.sort === "price-low"
      ? a.prices[c] - b.prices[c]
      : input.sort === "price-high"
        ? b.prices[c] - a.prices[c]
        : Number(b.featured) - Number(a.featured),
  );
  return {
    items: rows.slice(((input.page ?? 1) - 1) * 24, (input.page ?? 1) * 24),
    total: rows.length,
    page: input.page ?? 1,
    pages: Math.max(1, Math.ceil(rows.length / 24)),
  };
}
export async function getProducts() {
  return (await getCatalog()).items;
}
const cachedLookup = unstable_cache(
  async (skus: string[]) => {
    await connectDB();
    return priceProducts(
      (
        await Product.find({ active: true, sku: { $in: skus } })
          .limit(100)
          .lean()
      ).map(publicProduct),
    );
  },
  [cacheScope, "product-lookup-v3"],
  { revalidate: 60, tags: [catalogTag] },
);
export async function lookupProducts(skus: string[]) {
  return commerceEnabled()
    ? cachedLookup([...new Set(skus)].sort())
    : draftProducts.filter((p) => skus.includes(p.sku));
}
const cachedProduct = unstable_cache(
  async (slug: string) => {
    await connectDB();
    const row = await Product.findOne({ slug, active: true }).lean();
    if (!row) return null;
    const parent = row.parentSku || row.sku,
      variants = await Product.find({
        active: true,
        $or: [{ sku: parent }, { parentSku: parent }],
      })
        .limit(50)
        .lean();
    return {
      product: (await priceProducts([publicProduct(row)]))[0],
      variants: await priceProducts(variants.map(publicProduct)),
    };
  },
  [cacheScope, "product-v3"],
  { revalidate: 60, tags: [catalogTag] },
);
export const getProduct = cache(async (slug: string) =>
  commerceEnabled()
    ? cachedProduct(slug)
    : (() => {
        const product = draftProducts.find((p) => p.slug === slug);
        return product ? { product, variants: [product] } : null;
      })(),
);

async function priceProducts(products: ProductData[]) {
  const snapshot = await exchangeSnapshot();
  return products.map((p) => ({
    ...p,
    prices: Object.fromEntries(
      site.currencies
        .map((currency) => {
          try {
            return [currency, unitPrice(p.prices, currency, snapshot)];
          } catch {
            return [currency, undefined];
          }
        })
        .filter(([, value]) => value !== undefined),
    ) as Record<string, number>,
  }));
}
