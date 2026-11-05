"use client";
import { site } from "@/config/site";
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
import { SaveButtons } from "./saved-provider";
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
  const [remote, setRemote] = useState({
      items: products,
      total: products.length,
      pages: 1,
    }),
    [page, setPage] = useState(1),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [minPrice, setMinPrice] = useState(""),
    [maxPrice, setMaxPrice] = useState(""),
    [inStock, setInStock] = useState(false);
  useEffect(() => {
    setPage(1);
  }, [category, query, sort, currency, minPrice, maxPrice, inStock]);
  useEffect(() => {
    if (!live) return;
    const controller = new AbortController(),
      timer = setTimeout(async () => {
        setLoading(true);
        setError("");
        try {
          const qs = new URLSearchParams({
            query,
            category,
            sort,
            currency,
            page: String(page),
            inStock: String(inStock),
          });
          if (minPrice)
            qs.set("min", String(Math.round(Number(minPrice) * 100)));
          if (maxPrice)
            qs.set("max", String(Math.round(Number(maxPrice) * 100)));
          const r = await fetch(`/api/catalog?${qs}`, {
            signal: controller.signal,
          });
          const data = await r.json();
          if (!r.ok) throw new Error(data.error);
          setRemote(data);
        } catch (e) {
          if (!controller.signal.aborted)
            setError(e instanceof Error ? e.message : "Catalog unavailable");
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    live,
    query,
    category,
    sort,
    currency,
    page,
    minPrice,
    maxPrice,
    inStock,
  ]);
  const filtered = useMemo(
    () =>
      live
        ? remote.items
        : products
            .filter(
              (p) =>
                (category === "All" || p.category === category) &&
                `${p.name} ${p.category} ${p.tagline}`
                  .toLowerCase()
                  .includes(query.toLowerCase()) &&
                (!inStock || p.stock > 0) &&
                (!minPrice ||
                  p.prices[currency] >= Math.round(Number(minPrice) * 100)) &&
                (!maxPrice ||
                  p.prices[currency] <= Math.round(Number(maxPrice) * 100)),
            )
            .sort((a, b) =>
              sort === "price-low"
                ? a.prices[currency] - b.prices[currency]
                : sort === "price-high"
                  ? b.prices[currency] - a.prices[currency]
                  : Number(b.featured) - Number(a.featured),
            ),
    [
      live,
      remote,
      products,
      category,
      query,
      sort,
      currency,
      inStock,
      minPrice,
      maxPrice,
    ],
  );
  return (
    <section id="collection" className="shell section collection">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{site.copy.collectionEyebrow}</span>
          <h2>
            {site.copy.collectionTitle} <em>{site.copy.collectionAccent}</em>
          </h2>
        </div>
        <p>{site.copy.collectionDescription}</p>
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
      <div className="price-filters">
        <label>
          Minimum price ({currency})
          <input
            type="number"
            min={0}
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
          />
        </label>
        <label>
          Maximum price ({currency})
          <input
            type="number"
            min={0}
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={inStock}
            onChange={(e) => setInStock(e.target.checked)}
          />{" "}
          In stock only
        </label>
      </div>
      {loading && <p role="status">Updating collection…</p>}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <div className="results-row">
        <span aria-live="polite">
          {live ? remote.total : filtered.length} essentials
        </span>
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
            <SaveButtons sku={p.sku} />
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
      {live && remote.pages > 1 && (
        <nav className="pagination" aria-label="Collection pages">
          <button
            className="button outline"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {remote.pages}
          </span>
          <button
            className="button outline"
            disabled={page >= remote.pages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </nav>
      )}
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
