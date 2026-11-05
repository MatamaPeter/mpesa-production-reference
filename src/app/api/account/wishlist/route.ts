import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Customer } from "@/models/Customer";
import { requireCustomer } from "@/lib/customer-auth";
import { checkOrigin } from "@/lib/checkout-auth";
import { apiError, readJSON, RequestError } from "@/lib/http";
export async function GET() {
  try {
    const user = await requireCustomer();
    const row = await Customer.findById(user.id).select("wishlist").lean();
    return NextResponse.json({ items: row?.wishlist ?? [] });
  } catch (e) {
    return apiError(e);
  }
}
export async function PUT(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    const user = await requireCustomer();
    const input = z
      .object({
        items: z.array(z.string().regex(/^[a-z0-9-]{1,80}$/)).max(100),
      })
      .strict()
      .safeParse(await readJSON(req));
    if (!input.success) throw new RequestError("Invalid wishlist");
    await Customer.updateOne(
      { _id: user.id },
      { $set: { wishlist: [...new Set(input.data.items)] } },
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    const user = await requireCustomer();
    const input = z
      .object({
        sku: z.string().regex(/^[a-z0-9-]{1,80}$/),
        action: z.enum(["add", "remove"]),
      })
      .strict()
      .safeParse(await readJSON(req, 2000));
    if (!input.success) throw new RequestError("Invalid wishlist action");
    const result = await Customer.updateOne(
      {
        _id: user.id,
        ...(input.data.action === "add"
          ? { $expr: { $lt: [{ $size: { $ifNull: ["$wishlist", []] } }, 100] } }
          : {}),
      },
      input.data.action === "add"
        ? { $addToSet: { wishlist: input.data.sku } }
        : { $pull: { wishlist: input.data.sku } },
    );
    if (!result.matchedCount) throw new RequestError("Wishlist is full", 409);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
