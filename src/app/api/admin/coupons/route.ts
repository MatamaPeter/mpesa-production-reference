import { pageRecords } from "@/lib/pagination";
import { site } from "@/config/site";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { Coupon } from "@/models/Coupon";
import { requirePermission } from "@/lib/admin";
import { checkOrigin } from "@/lib/checkout-auth";
import { audit } from "@/lib/audit";
import { apiError, readJSON, RequestError } from "@/lib/http";
export async function GET(req: NextRequest) {
  try {
    await requirePermission("promotions.write");
    return NextResponse.json(await pageRecords(Coupon, req, {}));
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    const actor = await requirePermission("promotions.write"),
      input = z
        .object({
          code: z
            .string()
            .trim()
            .toUpperCase()
            .regex(/^[A-Z0-9-]{3,32}$/),
          kind: z.enum(["percent", "fixed"]),
          value: z.number().int().min(1).max(100000000),
          currency: z
            .string()
            .refine((c) => site.currencies.includes(c))
            .optional(),
          minimumSubtotal: z.number().int().min(0).max(100000000),
          maxDiscount: z.number().int().positive().optional(),
          maxUses: z.number().int().min(1).max(10000000),
          requireAccount: z.boolean(),
          active: z.boolean(),
          startsAt: z.iso.datetime(),
          endsAt: z.iso.datetime(),
        })
        .strict()
        .safeParse(await readJSON(req));
    if (!input.success)
      throw new RequestError("Check promotion fields and dates");
    const d = input.data;
    if (
      new Date(d.endsAt) <= new Date(d.startsAt) ||
      (d.kind === "percent" && d.value > 10000) ||
      ((d.kind === "fixed" || d.minimumSubtotal > 0 || d.maxDiscount) &&
        !d.currency) ||
      (d.currency === "KES" && d.kind === "fixed" && d.value % 100)
    )
      throw new RequestError("Invalid promotion value, currency or dates");
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const existing = await Coupon.findOne({ code: d.code }).session(
          session,
        );
        if (existing && existing.usedUses + existing.reservedUses > d.maxUses)
          throw new RequestError(
            "The usage limit cannot be below existing usage and reservations",
            409,
          );
        await Coupon.updateOne(
          { code: d.code },
          { $set: d, $setOnInsert: { usedUses: 0, reservedUses: 0 } },
          { session, upsert: true },
        );
        await audit(actor.id, "promotion.saved", d.code, {}, session);
      });
    } finally {
      await session.endSession();
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
