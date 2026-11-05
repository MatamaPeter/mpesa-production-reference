import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { site } from "@/config/site";
import { requireCustomer } from "@/lib/customer-auth";
import { Customer } from "@/models/Customer";
import { CustomerSession } from "@/models/CustomerSession";
import { checkOrigin } from "@/lib/checkout-auth";
import { rateLimit } from "@/lib/rate-limit";
import { seal, unseal, toBase32, verifyTotp, digest } from "@/lib/security";
import { apiError, readJSON, RequestError } from "@/lib/http";
export async function POST(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    const identity = await requireCustomer();
    await rateLimit("account-mfa", identity.id, 10, 15 * 60000);
    const input = z
      .object({
        action: z.enum(["setup", "activate", "challenge"]),
        code: z.string().max(80).optional(),
      })
      .strict()
      .safeParse(await readJSON(req, 2000));
    if (!input.success) throw new RequestError("Invalid security request");
    const user = await Customer.findById(identity.id).select(
      "+totpSecret +totpPending +recoveryHashes",
    );
    if (!user) throw new RequestError("Account unavailable", 401);
    if (input.data.action === "setup") {
      if (user.totpSecret)
        throw new RequestError("An authenticator is already enrolled", 409);
      const secret = toBase32(randomBytes(20));
      await Customer.updateOne(
        { _id: user._id },
        {
          $set: {
            totpPending: seal(secret),
            totpPendingUntil: new Date(Date.now() + 10 * 60000),
          },
        },
      );
      return NextResponse.json(
        {
          secret,
          uri: `otpauth://totp/${encodeURIComponent(site.brand.name + ":" + user.email)}?secret=${secret}&issuer=${encodeURIComponent(site.brand.name)}&algorithm=SHA1&digits=6&period=30`,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const code = input.data.code ?? "";
    if (input.data.action === "activate") {
      if (
        user.totpSecret ||
        !user.totpPending ||
        !user.totpPendingUntil ||
        user.totpPendingUntil.getTime() < Date.now()
      )
        throw new RequestError("Authenticator setup expired", 409);
      const counter = verifyTotp(unseal(user.totpPending), code);
      if (counter === null)
        throw new RequestError("Invalid authenticator code", 400);
      const recoveryCodes = Array.from({ length: 8 }, () =>
        randomBytes(16).toString("hex"),
      );
      const updated = await Customer.updateOne(
        {
          _id: user._id,
          totpSecret: { $exists: false },
          totpPending: user.totpPending,
        },
        {
          $set: {
            totpSecret: user.totpPending,
            totpLastCounter: counter,
            recoveryHashes: recoveryCodes.map(digest),
          },
          $unset: { totpPending: 1, totpPendingUntil: 1 },
        },
      );
      if (updated.modifiedCount !== 1)
        throw new RequestError(
          "Security settings changed. Refresh and retry.",
          409,
        );
      await CustomerSession.updateOne(
        { _id: identity.sessionId },
        { $set: { mfaAt: new Date() } },
      );
      return NextResponse.json(
        { ok: true, recoveryCodes },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (!user.totpSecret)
      throw new RequestError("Enroll an authenticator first", 409);
    const counter = verifyTotp(
      unseal(user.totpSecret),
      code,
      user.totpLastCounter ?? -1,
    );
    const update =
      counter !== null
        ? await Customer.updateOne(
            { _id: user._id, totpLastCounter: { $lt: counter } },
            { $set: { totpLastCounter: counter } },
          )
        : await Customer.updateOne(
            { _id: user._id, recoveryHashes: digest(code) },
            { $pull: { recoveryHashes: digest(code) } },
          );
    if (update.modifiedCount !== 1)
      throw new RequestError(
        "Invalid or previously used authenticator code",
        400,
      );
    await CustomerSession.updateOne(
      { _id: identity.sessionId },
      { $set: { mfaAt: new Date() } },
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
