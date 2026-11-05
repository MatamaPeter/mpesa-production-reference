import { pageRecords } from "@/lib/pagination";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { Review } from "@/models/Review";
import { requirePermission } from "@/lib/admin";
import { checkOrigin } from "@/lib/checkout-auth";
import { audit } from "@/lib/audit";
import { apiError, readJSON, RequestError } from "@/lib/http";
export async function GET(req: NextRequest) {
  try {
    await requirePermission("reviews.moderate");
    return NextResponse.json(
      await pageRecords(Review, req, { status: "pending" }),
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    const actor = await requirePermission("reviews.moderate"),
      input = z
        .object({
          id: z.string().regex(/^[a-f0-9]{24}$/i),
          status: z.enum(["approved", "rejected"]),
        })
        .strict()
        .safeParse(await readJSON(req));
    if (!input.success) throw new RequestError("Invalid moderation update");
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const r = await Review.updateOne(
          { _id: input.data.id, status: "pending" },
          { $set: { status: input.data.status } },
          { session },
        );
        if (!r.matchedCount)
          throw new RequestError("Review already handled", 409);
        await audit(
          actor.id,
          "review." + input.data.status,
          input.data.id,
          {},
          session,
        );
      });
    } finally {
      await session.endSession();
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
