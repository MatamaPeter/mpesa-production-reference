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
            <span className="small-dot" /> YOUR EVERYDAY, UPGRADED
          </div>
          <h1>
            Less ordinary.
            <br />
            More <em>possibility.</em>
          </h1>
          <p>
            Turn up the sound. Find your focus.
            <br />
            Meet the tech that moves with you.
          </p>
          <Link href="#collection" className="button light">
            Explore the collection <Icon name="arrow" />
          </Link>
          <div className="hero-bottom">
            <span>CURATED TECH. URBAN SPIRIT.</span>
            <span>01 — 06</span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <span className="hero-vertical">LISTEN DIFFERENTLY</span>
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
        <span>
          <b>01</b> Thoughtfully selected
        </span>
        <span>
          <b>02</b> Made for your everyday
        </span>
        <span>
          <b>03</b> A world of possibility
        </span>
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
            TAKE YOUR
            <br />
            GOOD VIBES
            <br />
            <em>EVERYWHERE.</em>
          </span>
        </div>
        <div className="editorial-copy">
          <span className="eyebrow">SMALL DETAILS. BIG DIFFERENCE.</span>
          <h2>
            Technology should
            <br />
            fit your life.
            <br />
            <em>Beautifully.</em>
          </h2>
          <p>
            From the first track of your morning to the last idea of the day.
            We’re building a collection of electronics that brings a little more
            possibility to every moment.
          </p>
          <Link className="text-link" href="/about">
            Get to know Leron <Icon name="arrow" />
          </Link>
        </div>
      </section>
      <section className="shell closing">
        <span className="eyebrow">THE LERON PERSPECTIVE</span>
        <h2>
          Stay connected.
          <br />
          Stay a little <em>curious.</em>
        </h2>
        <Link href="#collection" className="button dark">
          Find your next essential <Icon name="arrow" />
        </Link>
      </section>
    </main>
  );
}
