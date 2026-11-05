import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkOrigin } from "@/lib/checkout-auth";
import { requireAdmin } from "@/lib/admin";
import { connectDB } from "@/lib/db";
import { Product } from "@/models/Product";
import { draftProducts, validProductImage } from "@/lib/catalog";
import { apiError, readJSON, RequestError } from "@/lib/http";
const schema = z
  .object({
    sku: z.string().regex(/^[a-z0-9-]{1,80}$/),
    slug: z.string().regex(/^[a-z0-9-]{1,100}$/),
    name: z.string().min(2).max(120),
    category: z.enum([
      "Audio",
      "Wearables",
      "Cameras",
      "Computing",
      "Accessories",
    ]),
    tagline: z.string().max(180),
    description: z.string().min(10).max(4000),
    prices: z.object({
      USD: z.number().int().positive().max(100000000),
      KES: z.number().int().positive().max(100000000).multipleOf(100),
    }),
    image: z
      .string()
      .max(200)
      .refine(
        validProductImage,
        "Use a built-in illustration or a local product image path",
      ),
    features: z.array(z.string().max(100)).max(10),
    stock: z.number().int().min(0).max(100000),
    active: z.boolean(),
    featured: z.boolean(),
  })
  .strict();
export async function GET() {
  try {
    await requireAdmin();
    await connectDB();
    const rows = await Product.find().sort({ name: 1 }).lean();
    return NextResponse.json(
      rows.map((p) => ({
        sku: p.sku,
        slug: p.slug,
        name: p.name,
        category: p.category,
        tagline: p.tagline ?? "",
        description: p.description ?? "",
        prices: p.prices,
        image: p.image,
        features: p.features,
        stock: p.stock,
        active: p.active,
        featured: p.featured,
      })),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    await requireAdmin();
    const body = await readJSON(req);
    await connectDB();
    if (body?.action === "seed-drafts") {
      for (const p of draftProducts)
        await Product.updateOne(
          { sku: p.sku },
          { $setOnInsert: { ...p, stock: 0, active: false } },
          { upsert: true },
        );
      return NextResponse.json({ ok: true });
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      throw new RequestError(
        "Check product fields. Prices must be positive integer minor units; KES must be whole shillings.",
      );
    // Stock is changed with a delta so concurrent reservations are never overwritten.
    const { stock, ...data } = parsed.data;
    const current = await Product.findOne({ sku: data.sku });
    if (current) {
      const delta = stock - current.stock;
      const updated = await Product.updateOne(
        { sku: data.sku, stock: { $gte: -delta } },
        { $set: data, $inc: { stock: delta } },
        { runValidators: true },
      );
      if (updated.matchedCount !== 1)
        throw new RequestError(
          "Inventory changed. Refresh before editing.",
          409,
        );
    } else await Product.create({ ...data, stock });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
