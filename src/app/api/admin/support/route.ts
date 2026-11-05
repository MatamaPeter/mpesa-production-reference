import { pageRecords } from "@/lib/pagination";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { SupportTicket } from "@/models/SupportTicket";
import { EmailOutbox } from "@/models/EmailOutbox";
import { requirePermission } from "@/lib/admin";
import { checkOrigin } from "@/lib/checkout-auth";
import { audit } from "@/lib/audit";
import { site } from "@/config/site";
import { apiError, readJSON, RequestError } from "@/lib/http";
export async function GET(req: NextRequest) {
  try {
    await requirePermission("support.manage");
    return NextResponse.json(await pageRecords(SupportTicket, req, {}));
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    const actor = await requirePermission("support.manage"),
      input = z
        .object({
          id: z.string().regex(/^[a-f0-9]{24}$/i),
          status: z.enum(["open", "pending", "resolved"]),
          reply: z.string().trim().min(1).max(5000),
          requestId: z.string().uuid(),
        })
        .strict()
        .safeParse(await readJSON(req));
    if (!input.success) throw new RequestError("Invalid reply");
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const key = `support:${input.data.id}:${input.data.requestId}`;
        if (await EmailOutbox.exists({ eventKey: key }).session(session))
          return;
        const ticket = await SupportTicket.findByIdAndUpdate(
          input.data.id,
          {
            $set: { status: input.data.status },
            $push: {
              messages: {
                from: "staff",
                body: input.data.reply,
                at: new Date(),
              },
            },
          },
          { session, returnDocument: "after" },
        );
        if (!ticket) throw new RequestError("Ticket not found", 404);
        await EmailOutbox.create(
          [
            {
              eventKey: key,
              to: ticket.email,
              subject: `${site.brand.name}: ${ticket.subject}`,
              text: input.data.reply,
              status: "pending",
              nextAttemptAt: new Date(),
            },
          ],
          { session },
        );
        await audit(
          actor.id,
          "support.replied",
          String(ticket._id),
          { status: input.data.status },
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
