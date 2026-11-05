import { catalogTag } from "@/lib/cache-scope";
import { validGTIN } from "@/lib/money";
import { pageRecords } from "@/lib/pagination";
import mongoose from "mongoose";
import { revalidateTag } from "next/cache";
import { site } from "@/config/site";
import { initializeBalance } from "@/lib/inventory";
import { audit } from "@/lib/audit";
import { publicProduct } from "@/lib/products";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkOrigin } from "@/lib/checkout-auth";
import { requirePermission, requireAdmin } from "@/lib/admin";
import { connectDB } from "@/lib/db";
import { Product } from "@/models/Product";
import { draftProducts, validProductImage } from "@/lib/catalog";
import { apiError, readJSON, RequestError } from "@/lib/http";
const schema = z
  .object({
    sku: z.string().regex(/^[a-z0-9-]{1,80}$/),
    slug: z.string().regex(/^[a-z0-9-]{1,100}$/),
    name: z.string().min(2).max(120),
    category: z.string().min(1).max(80),
    tagline: z.string().max(180),
    brand: z.string().max(100).optional(),
    gtin: z.string().refine(validGTIN, "Invalid barcode checksum").optional(),
    mpn: z.string().max(100).optional(),
    condition: z.enum(["new", "refurbished", "used"]).optional(),
    description: z.string().min(10).max(4000),
    prices: z
      .record(
        z.string().regex(/^[A-Z]{3}$/),
        z.number().int().positive().max(100000000),
      )
      .refine(
        (p) =>
          Object.keys(p).every((c) => site.currencies.includes(c)) &&
          Object.keys(p).length > 0 &&
          (!p.KES || p.KES % 100 === 0),
      ),
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
    parentSku: z
      .string()
      .regex(/^[a-z0-9-]{0,80}$/)
      .optional(),
    attributes: z
      .array(
        z.object({
          name: z.string().min(1).max(50),
          value: z.string().min(1).max(100),
        }),
      )
      .max(10)
      .optional(),
    specifications: z
      .array(
        z.object({
          name: z.string().min(1).max(100),
          value: z.string().min(1).max(300),
        }),
      )
      .max(50)
      .optional(),
    images: z.array(z.string().refine(validProductImage)).max(10).optional(),
    tags: z.array(z.string().max(50)).max(30).optional(),
    weightGrams: z.number().int().min(1).max(1000000).optional(),
    taxCode: z
      .string()
      .regex(/^txcd_\d{8}$/)
      .optional(),
  })
  .strict();
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    await connectDB();
    const page = await pageRecords(Product, req);
    return NextResponse.json(
      { ...page, items: page.items.map(publicProduct) },
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
    const actor = await requirePermission("catalog.write");
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

    const { stock, ...data } = parsed.data;
    if (data.parentSku === data.sku)
      throw new RequestError("A variant cannot be its own parent");
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        if (
          data.parentSku &&
          !(await Product.exists({
            sku: data.parentSku,
            parentSku: { $in: [null, ""] },
          }).session(session))
        )
          throw new RequestError("Select an existing parent product", 409);
        const existing = await Product.findOne({ sku: data.sku }).session(
          session,
        );
        if (existing)
          await Product.updateOne(
            { sku: data.sku },
            { $set: data, $unset: { marketPriceTimestamp: 1 } },
            { session, runValidators: true },
          );
        else {
          await Product.create([{ ...data, stock }], { session });
          await initializeBalance(data.sku, stock, session);
        }
        await audit(
          actor.id,
          "catalog.saved",
          data.sku,
          { created: !existing },
          session,
        );
      });
    } finally {
      await session.endSession();
    }
    revalidateTag(catalogTag, { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
