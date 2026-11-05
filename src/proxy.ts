import { NextResponse, type NextRequest } from "next/server";
export function proxy(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64"),
    dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(!dev && process.env.APP_ORIGIN?.startsWith("https://")
      ? ["upgrade-insecure-requests"]
      : []),
  ].join("; ");
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  if (
    (req.nextUrl.pathname.startsWith("/api/") &&
      !req.nextUrl.pathname.startsWith("/api/catalog") &&
      !req.nextUrl.pathname.startsWith("/api/media/") &&
      !req.nextUrl.pathname.startsWith("/api/reviews")) ||
    req.nextUrl.pathname.startsWith("/admin") ||
    req.nextUrl.pathname.startsWith("/orders")
  )
    response.headers.set("Cache-Control", "no-store");
  if (req.nextUrl.pathname.startsWith("/account"))
    response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|products/.*\\.svg).*)"],
};
