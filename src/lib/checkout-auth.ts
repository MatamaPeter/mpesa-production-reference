import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
const COOKIE = "guest_checkout";
const secret = () => {
  const s = process.env.CHECKOUT_COOKIE_SECRET;
  if (!s || s.length < 32)
    throw new Error("CHECKOUT_COOKIE_SECRET missing/short");
  return s;
};
export const hashToken = (token: string) =>
  createHmac("sha256", secret()).update(token).digest("hex");
export async function checkoutIdentity(create = false) {
  const jar = await cookies();
  let token = jar.get(COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    if (!create) return null;
    token = randomBytes(32).toString("hex");
    jar.set(COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }
  return hashToken(token);
}
export function safeCompare(a: string, b: string) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function checkOrigin(req: Request) {
  const origin = req.headers.get("origin");
  return Boolean(origin && origin === process.env.APP_ORIGIN);
}
