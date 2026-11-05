import { NextRequest, NextResponse } from "next/server";
import { EmailOutbox } from "@/models/EmailOutbox";
import { AuthToken } from "@/models/AuthToken";
import { z } from "zod";
import { requirePermission } from "@/lib/admin";
import { checkOrigin } from "@/lib/checkout-auth";
import { pageRecords } from "@/lib/pagination";
import { audit } from "@/lib/audit";
import { apiError, readJSON, RequestError } from "@/lib/http";
export async function GET(req: NextRequest) {
  try {
    await requirePermission("audit.read");
    return NextResponse.json(
      await pageRecords(
        EmailOutbox,
        req,
        {},
        "eventKey status attempts nextAttemptAt createdAt sentAt providerId",
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    const actor = await requirePermission("email.manage"),
      input = z
        .object({
          id: z.string().regex(/^[a-f0-9]{24}$/i),
          note: z.string().trim().min(10).max(1000),
        })
        .strict()
        .safeParse(await readJSON(req));
    if (!input.success) throw new RequestError("Supply an audit note");
    const row = await EmailOutbox.findOne({
      _id: input.data.id,
      status: "review",
    });
    if (!row) throw new RequestError("Review job not found", 404);
    if (
      Date.now() - row.createdAt.getTime() > 23 * 3600000 ||
      row.attempts >= 8
    )
      throw new RequestError(
        "Verify delivery with the provider; this job is outside its safe retry window",
        409,
      );
    if (
      row.eventKey.startsWith("auth:") &&
      !(await AuthToken.exists({
        _id: row.eventKey.slice(5),
        usedAt: null,
        expiresAt: { $gt: new Date() },
      }))
    )
      throw new RequestError(
        "This sign-in link expired. Ask the customer to request a new one",
        409,
      );
    await EmailOutbox.updateOne(
      { _id: row._id, status: "review" },
      { $set: { status: "pending", nextAttemptAt: new Date() } },
    );
    await audit(actor.id, "email.retry_requested", String(row._id), {
      note: input.data.note,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
