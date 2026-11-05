import { sessionCookies } from "@/config/site";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { checkOrigin } from "@/lib/checkout-auth";
import { readJSON, apiError, RequestError } from "@/lib/http";
import { verifyPassword, signAdminSession } from "@/lib/admin-crypto";
import { rateLimit } from "@/lib/rate-limit";
export async function POST(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    if (process.env.ADMIN_BOOTSTRAP_ENABLED !== "true")
      throw new RequestError(
        "Use your staff account and authenticator to sign in",
        403,
      );
    const hash = process.env.ADMIN_PASSWORD_HASH,
      secret = process.env.ADMIN_SESSION_SECRET;
    if (!hash || !secret || secret.length < 32)
      throw new RequestError("Administration has not been configured", 503);
    const parsed = z
      .object({ password: z.string().min(1).max(200) })
      .safeParse(await readJSON(req, 2000));
    if (!parsed.success) throw new RequestError("Invalid credentials", 401);
    // Shared durable throttle is independent of untrusted forwarded IP headers.
    await rateLimit("admin-login", "global", 10, 15 * 60000);
    if (!verifyPassword(parsed.data.password, hash))
      throw new RequestError("Invalid credentials", 401);
    (await cookies()).set(
      sessionCookies.admin,
      signAdminSession(secret, hash),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 8 * 3600,
      },
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
