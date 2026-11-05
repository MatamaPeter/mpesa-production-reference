import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Review } from "@/models/Review";
import { Order } from "@/models/Order";
import { requireCustomer } from "@/lib/customer-auth";
import { checkOrigin } from "@/lib/checkout-auth";
import { connectDB } from "@/lib/db";
import { commerceEnabled } from "@/lib/store";
import { rateLimit } from "@/lib/rate-limit";
import { apiError, readJSON, RequestError } from "@/lib/http";
export async function GET(req: NextRequest) {
  try {
    const sku = req.nextUrl.searchParams.get("sku") ?? "";
    if (!/^[a-z0-9-]{1,80}$/.test(sku))
      throw new RequestError("Invalid product");
    if (!commerceEnabled())
      return NextResponse.json({ items: [], count: 0, average: 0 });
    await connectDB();
    const items = await Review.find({ sku, status: "approved" })
        .sort({ createdAt: -1 })
        .limit(20)
        .select("displayName rating title body verifiedPurchase createdAt")
        .lean(),
      [summary] = await Review.aggregate([
        { $match: { sku, status: "approved" } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            average: { $avg: "$rating" },
          },
        },
      ]);
    return NextResponse.json(
      { items, count: summary?.count ?? 0, average: summary?.average ?? 0 },
      { headers: { "Cache-Control": "public, max-age=15, s-maxage=60" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    const user = await requireCustomer();
    const parsed = z
      .object({
        sku: z.string().regex(/^[a-z0-9-]{1,80}$/),
        rating: z.number().int().min(1).max(5),
        title: z.string().trim().min(3).max(100),
        body: z.string().trim().min(10).max(3000),
      })
      .strict()
      .safeParse(await readJSON(req));
    if (!parsed.success) throw new RequestError("Check your rating and review");
    await rateLimit("review", user.id, 5, 3600000);
    if (
      !(await Order.exists({
        customerId: user.id,
        status: "paid",
        "items.sku": parsed.data.sku,
      }))
    )
      throw new RequestError(
        "Only verified purchasers can review this product",
        403,
      );
    await Review.findOneAndUpdate(
      { customerId: user.id, sku: parsed.data.sku },
      {
        $set: {
          ...parsed.data,
          displayName: user.name
            ? user.name.split(" ")[0]
            : "Verified customer",
          status: "pending",
          verifiedPurchase: true,
        },
      },
      { upsert: true },
    );
    return NextResponse.json({
      ok: true,
      message: "Your review is awaiting moderation",
    });
  } catch (e) {
    return apiError(e);
  }
}
