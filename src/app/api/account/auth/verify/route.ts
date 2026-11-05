import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import { sessionCookies } from "@/config/site";
import { AuthToken } from "@/models/AuthToken";
import { Customer } from "@/models/Customer";
import { CustomerSession } from "@/models/CustomerSession";
import { Order } from "@/models/Order";
import { connectDB } from "@/lib/db";
import { checkOrigin, checkoutIdentity } from "@/lib/checkout-auth";
import { digest } from "@/lib/security";
import { apiError, readJSON, RequestError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
export async function POST(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    if (process.env.ACCOUNT_AUTH_ENABLED !== "true")
      throw new RequestError("Account sign-in unavailable", 503);
    const parsed = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict()
      .safeParse(await readJSON(req, 2000));
    if (!parsed.success) throw new RequestError("Invalid sign-in link");
    await rateLimit("auth-verify-global", "global", 300);
    await connectDB();
    const session = await mongoose.startSession(),
      token = randomBytes(32).toString("hex"),
      guest = await checkoutIdentity();
    try {
      await session.withTransaction(async () => {
        const invitation = await AuthToken.findOneAndUpdate(
          {
            _id: digest(parsed.data.token),
            usedAt: null,
            expiresAt: { $gt: new Date() },
          },
          { $set: { usedAt: new Date() } },
          { session, returnDocument: "after" },
        );
        if (!invitation)
          throw new RequestError("This link expired or was already used", 400);
        const user = await Customer.findOneAndUpdate(
          { email: invitation.email },
          {
            $setOnInsert: {
              name: invitation.name,
              role: "customer",
              disabled: false,
            },
            $set: { verifiedAt: new Date() },
          },
          { upsert: true, session, returnDocument: "after" },
        );
        if (user.disabled)
          throw new RequestError("This account is unavailable", 403);
        await CustomerSession.create(
          [
            {
              _id: digest(token),
              customerId: user._id,
              expiresAt: new Date(Date.now() + 30 * 86400000),
            },
          ],
          { session },
        );
        await Order.updateMany(
          {
            customerId: null,
            "address.email": user.email,
          },
          { $set: { customerId: user._id } },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    (await cookies()).set(sessionCookies.customer, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 86400,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
