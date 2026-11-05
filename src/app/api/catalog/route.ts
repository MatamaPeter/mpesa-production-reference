import { site } from "@/config/site";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCatalog, lookupProducts } from "@/lib/products";
import { apiError, RequestError } from "@/lib/http";
const schema = z.object({
  query: z.string().max(80).optional(),
  category: z.string().max(80).optional(),
  sort: z.enum(["featured", "price-low", "price-high"]).optional(),
  currency: z
    .string()
    .refine((c) => site.currencies.includes(c))
    .optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  min: z.coerce.number().int().min(0).max(100000000).optional(),
  max: z.coerce.number().int().min(0).max(100000000).optional(),
  inStock: z.enum(["true", "false"]).optional(),
});
export async function GET(req: NextRequest) {
  try {
    const skus = req.nextUrl.searchParams.get("skus");
    if (skus) {
      const ids = skus.split(",");
      if (ids.length > 100 || ids.some((s) => !/^[a-z0-9-]{1,80}$/.test(s)))
        throw new RequestError("Invalid product lookup");
      return NextResponse.json(
        { items: await lookupProducts(ids) },
        {
          headers: {
            "Cache-Control":
              "public, max-age=15, s-maxage=60, stale-while-revalidate=120",
          },
        },
      );
    }
    const parsed = schema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    if (!parsed.success) throw new RequestError("Invalid catalog filters");
    return NextResponse.json(
      await getCatalog({
        ...parsed.data,
        inStock: parsed.data.inStock === "true",
      }),
      {
        headers: {
          "Cache-Control":
            "public, max-age=15, s-maxage=60, stale-while-revalidate=120",
        },
      },
    );
  } catch (e) {
    return apiError(e);
  }
}
