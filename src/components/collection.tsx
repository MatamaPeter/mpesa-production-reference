"use client";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  categories,
  formatMoney,
  productImage,
  type ProductData,
} from "@/lib/catalog";
import { useCart } from "./cart-provider";
import { Icon } from "./icons";
export function Collection({
  products,
  live,
}: {
  products: ProductData[];
  live: boolean;
}) {
  const params = useSearchParams(),
    [category, setCategory] = useState("All"),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("featured"),
    { currency, add, ready } = useCart();
  useEffect(() => {
    const requested = params.get("category");
    setCategory(
      requested && categories.includes(requested) ? requested : "All",
    );
  }, [params]);
  const filtered = useMemo(
    () =>
      products
        .filter(
          (p) =>
            (category === "All" || p.category === category) &&
            `${p.name} ${p.category} ${p.tagline}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "price-low"
            ? a.prices[currency] - b.prices[currency]
            : sort === "price-high"
              ? b.prices[currency] - a.prices[currency]
              : Number(b.featured) - Number(a.featured),
        ),
    [products, category, query, sort, currency],
  );
  return (
    <section id="collection" className="shell section collection">
      <div className="section-heading">
        <div>
          <span className="eyebrow">THE GOOD STUFF</span>
          <h2>
            Meet your next <em>essential.</em>
          </h2>
        </div>
        <p>
          Considered design. Everyday possibility.
          <br />A new way to make it yours.
        </p>
      </div>
      {!live && (
        <div className="draft-note">
          <span className="small-dot" /> Preview collection · Illustrative
          products and prices. Checkout opens after products and store policies
          are approved.
        </div>
      )}
      <div className="collection-toolbar">
        <div
          className="category-tabs"
          role="group"
          aria-label="Filter by category"
        >
          {categories.map((c) => (
            <button
              key={c}
              className={category === c ? "selected" : ""}
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
            >
              {c}
            </button>
          ))}
        </div>
        <label className="search-box">
          <Icon name="search" />
          <span className="sr-only">Search products</span>
          <input
            placeholder="Find your tech"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <div className="results-row">
        <span aria-live="polite">{filtered.length} essentials</span>
        <label>
          Sort by{" "}
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="featured">Featured</option>
            <option value="price-low">Price: low to high</option>
            <option value="price-high">Price: high to low</option>
          </select>
        </label>
      </div>
      <div className="product-grid">
        {filtered.map((p, index) => (
          <article className="product-card" key={p.sku}>
            <Link
              className={`product-art art-${p.image}`}
              href={`/products/${p.slug}`}
            >
              <span className="product-tag">
                {!live
                  ? "THE PREVIEW"
                  : p.stock > 0
                    ? "IN THE COLLECTION"
                    : "SOLD OUT"}
              </span>
              <Image
                src={productImage(p.image)}
                alt={p.name}
                width={480}
                height={480}
                className="product-image"
              />
              <span className="product-index">0{index + 1}</span>
            </Link>
            <div className="product-info">
              <div>
                <span className="product-category">{p.category}</span>
                <h3>
                  <Link href={`/products/${p.slug}`}>{p.name}</Link>
                </h3>
                <p>{p.tagline}</p>
              </div>
              <span className="price">
                {formatMoney(p.prices[currency], currency)}
              </span>
            </div>
            <button
              className="add-button"
              disabled={!ready || (live && p.stock === 0)}
              onClick={() => add(p.sku)}
            >
              {live
                ? p.stock > 0
                  ? "Add to bag"
                  : "Out of stock"
                : "Add to preview bag"}
              <Icon name="plus" />
            </button>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <div className="empty-state">
          <h3>No essentials found.</h3>
          <p>Try a different search or explore all categories.</p>
          <button
            className="button dark"
            onClick={() => {
              setCategory("All");
              setQuery("");
            }}
          >
            Reset filters
          </button>
        </div>
      )}
    </section>
  );
}
