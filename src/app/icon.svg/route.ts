import { site } from "@/config/site";
export function GET() {
  const text = site.brand.wordmark.charAt(0).replace(/[<>&"']/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${site.theme.primary}"/><text x="32" y="47" text-anchor="middle" font-family="Arial,sans-serif" font-size="45" font-weight="bold" fill="${site.theme.accent}">${text}</text></svg>`;
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
