import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { Product } from "@/models/Product";
import { site } from "@/config/site";
import { productImage } from "@/lib/catalog";
import { indexingEnabled, publicOrigin, xml, moneyDecimal } from "@/lib/seo";
export async function GET(req: NextRequest) {
  const origin = publicOrigin();
  if (!origin || !indexingEnabled())
    return new Response(
      "Merchant feed is available after live-store approval.",
      { status: 404 },
    );
  const page = Number(req.nextUrl.searchParams.get("page") ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > 1000)
    return new Response("Invalid page", { status: 400 });
  await connectDB();
  const rows = await Product.find({ active: true })
      .sort({ _id: 1 })
      .skip((page - 1) * 5000)
      .limit(5000)
      .lean(),
    currency = site.locale.defaultCurrency;
  const items = rows
    .filter(
      (p) =>
        Number.isSafeInteger(p.prices?.[currency]) && p.prices[currency] > 0,
    )
    .map(
      (p) =>
        `<item><g:id>${xml(p.sku)}</g:id><g:title>${xml(p.name)}</g:title><g:description>${xml(p.description ?? "")}</g:description><g:link>${xml(origin + "/products/" + p.slug)}</g:link><g:image_link>${xml(origin + productImage(p.image))}</g:image_link><g:availability>${p.stock > 0 ? "in_stock" : "out_of_stock"}</g:availability><g:price>${moneyDecimal(p.prices[currency], currency)} ${currency}</g:price><g:condition>${xml(p.condition ?? "new")}</g:condition>${p.brand ? `<g:brand>${xml(p.brand)}</g:brand>` : ""}${p.gtin ? `<g:gtin>${xml(p.gtin)}</g:gtin>` : ""}${p.mpn ? `<g:mpn>${xml(p.mpn)}</g:mpn>` : ""}${!p.gtin && !p.mpn ? "<g:identifier_exists>no</g:identifier_exists>" : ""}</item>`,
    )
    .join("");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>${xml(site.brand.name)}</title><link>${xml(origin)}</link><description>${xml(site.brand.description)}</description>${items}</channel></rss>`,
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}
