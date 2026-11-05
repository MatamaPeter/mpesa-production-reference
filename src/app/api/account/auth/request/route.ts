import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { site } from "@/config/site";
import { AuthToken } from "@/models/AuthToken";
import { EmailOutbox } from "@/models/EmailOutbox";
import { checkOrigin } from "@/lib/checkout-auth";
import { rateLimit } from "@/lib/rate-limit";
import { apiError, readJSON, RequestError } from "@/lib/http";
import { digest } from "@/lib/security";
export async function POST(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    if (!site.features.accounts || process.env.ACCOUNT_AUTH_ENABLED !== "true")
      throw new RequestError("Account sign-in is not configured yet", 503);
    const parsed = z
      .object({
        email: z
          .email()
          .max(254)
          .transform((s) => s.trim().toLowerCase()),
        name: z.string().trim().max(100).default(""),
      })
      .strict()
      .safeParse(await readJSON(req, 3000));
    if (!parsed.success) throw new RequestError("Enter a valid email address");
    await rateLimit("account-auth-global", "global", 120, 60000);
    await rateLimit("account-auth-email", parsed.data.email, 3, 15 * 60000);
    const origin = process.env.APP_ORIGIN;
    if (!origin)
      throw new RequestError("Account configuration unavailable", 503);
    const token = randomBytes(32).toString("hex"),
      hash = digest(token),
      session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await AuthToken.create(
          [
            {
              _id: hash,
              ...parsed.data,
              expiresAt: new Date(Date.now() + 15 * 60000),
            },
          ],
          { session },
        );
        await EmailOutbox.create(
          [
            {
              eventKey: `auth:${hash}`,
              to: parsed.data.email,
              subject: `Sign in to ${site.brand.name}`,
              text: `Use this one-time link to sign in. It expires in 15 minutes.

${origin}/account/verify?token=${token}

If you did not request this email, ignore it. Never share your link.`,
              status: "pending",
              nextAttemptAt: new Date(),
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    return NextResponse.json({
      ok: true,
      message:
        "If sign-in is available for this address, a one-time link will arrive shortly.",
    });
  } catch (e) {
    return apiError(e);
  }
}
