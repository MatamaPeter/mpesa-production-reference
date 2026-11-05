import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { Customer } from "@/models/Customer";
import { CustomerSession } from "@/models/CustomerSession";
import { Guard } from "@/models/Guard";
import { requirePermission } from "@/lib/admin";
import { checkOrigin } from "@/lib/checkout-auth";
import { audit } from "@/lib/audit";
import { apiError, readJSON, RequestError } from "@/lib/http";
export async function GET(req: NextRequest) {
  try {
    await requirePermission("staff.manage");
    const cursor = req.nextUrl.searchParams.get("cursor");
    if (cursor && !/^[a-f0-9]{24}$/i.test(cursor))
      throw new RequestError("Invalid page cursor");
    const rows = await Customer.find({
      ...(cursor ? { _id: { $gt: cursor } } : {}),
    })
      .sort({ _id: 1 })
      .limit(51)
      .select("name email role disabled verifiedAt")
      .lean();
    return NextResponse.json({
      items: rows.slice(0, 50),
      nextCursor: rows.length > 50 ? String(rows[49]._id) : null,
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    const actor = await requirePermission("staff.manage");
    if (
      !actor.legacy &&
      Date.now() - new Date(actor.mfaAt).getTime() > 15 * 60000
    )
      throw new RequestError(
        "Verify your authenticator again before changing staff access",
        403,
      );
    const input = z
      .object({
        email: z
          .email()
          .max(254)
          .transform((s) => s.toLowerCase()),
        role: z.enum([
          "customer",
          "owner",
          "manager",
          "support",
          "warehouse",
          "finance",
        ]),
        disabled: z.boolean(),
      })
      .strict()
      .safeParse(await readJSON(req, 3000));
    if (!input.success) throw new RequestError("Invalid staff details");
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await Guard.updateOne(
          { _id: "staff-roles" },
          { $inc: { version: 1 } },
          { upsert: true, session },
        );
        if (
          !actor.legacy &&
          !(await Customer.exists({
            _id: actor.id,
            role: "owner",
            disabled: false,
          }).session(session))
        )
          throw new RequestError("Owner access changed", 403);
        const user = await Customer.findOne({
          email: input.data.email,
          verifiedAt: { $ne: null },
        }).session(session);
        if (!user)
          throw new RequestError(
            "Ask this person to sign in and verify their email first",
            404,
          );
        if (
          user.role === "owner" &&
          (input.data.role !== "owner" || input.data.disabled) &&
          (await Customer.countDocuments({
            role: "owner",
            disabled: false,
          }).session(session)) <= 1
        )
          throw new RequestError(
            "The last active owner cannot be removed",
            409,
          );
        await Customer.updateOne(
          { _id: user._id },
          { $set: { role: input.data.role, disabled: input.data.disabled } },
          { session },
        );
        await CustomerSession.updateMany(
          { customerId: user._id, revokedAt: null },
          { $set: { revokedAt: new Date() } },
          { session },
        );
        await audit(
          actor.id,
          "staff.role_changed",
          String(user._id),
          { role: input.data.role, disabled: input.data.disabled },
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
