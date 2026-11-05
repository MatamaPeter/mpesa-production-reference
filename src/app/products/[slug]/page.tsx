import { headers } from "next/headers";
import { site } from "@/config/site";
import { productImage } from "@/lib/catalog";
import { publicOrigin, indexingEnabled, moneyDecimal } from "@/lib/seo";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProduct, getProducts } from "@/lib/products";
import { commerceEnabled } from "@/lib/store";
import { ProductDetail } from "@/components/product-detail";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = (await getProduct(slug))?.product;
  const origin = publicOrigin();
  return {
    title: p?.name ?? "Product not found",
    description: p?.description,
    ...(origin && p
      ? {
          alternates: { canonical: `${origin}/products/${p.slug}` },
          openGraph: {
            title: p.name,
            description: p.description,
            siteName: site.brand.name,
            type: "website",
            images: [{ url: origin + productImage(p.image), alt: p.name }],
          },
        }
      : {}),
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getProduct(slug),
    p = result?.product;
  if (!p) notFound();
  const origin = publicOrigin(),
    currency = site.locale.defaultCurrency,
    nonce = (await headers()).get("x-nonce") ?? undefined;
  const structured =
    origin && indexingEnabled() && Number.isSafeInteger(p.prices[currency])
      ? {
          "@context": "https://schema.org",
          "@type": "Product",
          name: p.name,
          description: p.description,
          sku: p.sku,
          image: origin + productImage(p.image),
          ...(p.brand ? { brand: { "@type": "Brand", name: p.brand } } : {}),
          offers: {
            "@type": "Offer",
            url: `${origin}/products/${p.slug}`,
            priceCurrency: currency,
            price: moneyDecimal(p.prices[currency], currency),
            availability:
              p.stock > 0
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
          },
        }
      : null;
  return (
    <>
      {structured && (
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structured).replace(/</g, "\\u003c"),
          }}
        />
      )}
      <ProductDetail
        product={p}
        variants={result?.variants ?? []}
        live={commerceEnabled()}
      />
    </>
  );
}
