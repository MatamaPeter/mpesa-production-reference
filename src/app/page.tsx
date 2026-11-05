import { site, storageKey } from "@/config/site";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { draftProducts, productImage } from "@/lib/catalog";
import { getProducts } from "@/lib/products";
import { Collection } from "@/components/collection";
import { commerceEnabled } from "@/lib/store";
import { Icon } from "@/components/icons";
export const dynamic = "force-dynamic";
export default async function Home() {
  const products = await getProducts(),
    live = commerceEnabled(),
    heroProduct =
      products.find((p) => p.featured) ?? products[0] ?? draftProducts[0];
  return (
    <main id="main">
      <section className="shell hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="small-dot" /> {site.copy.heroEyebrow}
          </div>
          <h1>
            {site.copy.heroTitle}
            <br />
            {site.copy.heroSecondLine} <em>{site.copy.heroAccent}</em>
          </h1>
          <p>{site.copy.heroDescription}</p>
          <Link href="#collection" className="button light">
            Explore the collection <Icon name="arrow" />
          </Link>
          <div className="hero-bottom">
            <span>{site.copy.heroFooter}</span>
            <span>01 — 06</span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <span className="hero-vertical">{site.copy.heroVertical}</span>
          <Image
            src={productImage(heroProduct.image)}
            alt={heroProduct.name}
            width={650}
            height={650}
            priority
            className="hero-product"
          />
          <div className="hero-product-label">
            <div>
              <span>THE {heroProduct.category.toUpperCase()} EDIT</span>
              <h2>{heroProduct.name}</h2>
            </div>
            <Link
              href={
                products.length
                  ? `/products/${heroProduct.slug}`
                  : "/#collection"
              }
              className="round-link"
              aria-label={`Explore ${heroProduct.name}`}
            >
              <Icon name="arrow" />
            </Link>
          </div>
          <span className="image-caption">
            {live
              ? "CURATED FOR YOUR EVERYDAY"
              : "CONCEPT PRODUCT · DRAFT COLLECTION"}
          </span>
        </div>
      </section>
      <section className="values-strip shell" aria-label="Our approach">
        {site.copy.values.map((value, i) => (
          <span key={value}>
            <b>0{i + 1}</b>
            {value}
          </span>
        ))}
      </section>
      <Suspense
        fallback={<div className="shell section">Loading collection…</div>}
      >
        <Collection products={products} live={commerceEnabled()} />
      </Suspense>
      <section className="shell editorial">
        <div className="editorial-art">
          <Image
            src="/products/speaker.svg"
            alt="Illustration of a compact portable speaker"
            width={500}
            height={500}
          />
          <span>
            {site.copy.editorialPoster}
            <br />
            <em>{site.copy.editorialPosterAccent}</em>
          </span>
        </div>
        <div className="editorial-copy">
          <span className="eyebrow">{site.copy.editorialEyebrow}</span>
          <h2>
            {site.copy.editorialTitle}
            <br />
            <em>{site.copy.editorialAccent}</em>
          </h2>
          <p>{site.copy.editorialDescription}</p>
          <Link className="text-link" href="/about">
            Get to know {site.brand.wordmark} <Icon name="arrow" />
          </Link>
        </div>
      </section>
      <section className="shell closing">
        <span className="eyebrow">{site.brand.wordmark} · OUR PERSPECTIVE</span>
        <h2>
          {site.copy.closingTitle}
          <br />
          <em>{site.copy.closingAccent}</em>
        </h2>
        <Link href="#collection" className="button dark">
          Find your next essential <Icon name="arrow" />
        </Link>
      </section>
    </main>
  );
}
