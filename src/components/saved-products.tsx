"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSaved, SaveButtons } from "./saved-provider";
import { useCart } from "./cart-provider";
import { formatMoney, productImage, type ProductData } from "@/lib/catalog";
export function SavedProducts({ products }: { products: ProductData[] }) {
  const { wishlist, comparison, recent, ready } = useSaved(),
    { currency, add } = useCart();
  const [resolved, setResolved] = useState(products);
  useEffect(() => {
    const missing = [
      ...new Set([...wishlist, ...comparison, ...recent]),
    ].filter((sku) => !resolved.some((p) => p.sku === sku));
    if (!missing.length) return;
    const controller = new AbortController();
    void fetch(`/api/catalog?skus=${missing.slice(0, 100).join(",")}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.items) && data.items.length)
          setResolved((current) => [...current, ...data.items]);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [wishlist, comparison, recent, resolved]);
  function cards(skus: string[]) {
    return (
      <div className="product-grid">
        {skus.map((sku) => {
          const p = resolved.find((p) => p.sku === sku);
          return p ? (
            <article className="product-card" key={sku}>
              <Link
                className={`product-art art-${p.image}`}
                href={`/products/${p.slug}`}
              >
                <Image
                  src={productImage(p.image)}
                  alt={p.name}
                  width={400}
                  height={400}
                />
              </Link>
              <div className="product-info">
                <h3>
                  <Link href={`/products/${p.slug}`}>{p.name}</Link>
                </h3>
                <strong>{formatMoney(p.prices[currency], currency)}</strong>
              </div>
              <SaveButtons sku={sku} />
              <button className="add-button" onClick={() => add(sku)}>
                Add to bag +
              </button>
            </article>
          ) : (
            <article className="address-card" key={sku}>
              <p>Product {sku} is no longer available.</p>
              <SaveButtons sku={sku} />
            </article>
          );
        })}
      </div>
    );
  }
  const compared = comparison
    .map((s) => resolved.find((p) => p.sku === s))
    .filter((p): p is ProductData => !!p);
  return (
    <main id="main" className="shell section">
      <span className="eyebrow">MAKE ROOM FOR THE GOOD STUFF</span>
      <h1 className="page-title">
        Keep it <em>close.</em>
      </h1>
      {!ready ? (
        <p role="status">Loading saved products…</p>
      ) : (
        <>
          <section>
            <h2>Your wishlist</h2>
            <p className="fine-print">
              Saved in this browser. Sign in to keep an account wishlist across
              devices.
            </p>
            {wishlist.length ? (
              cards(wishlist)
            ) : (
              <p>No saved products yet. Use the Save button on any product.</p>
            )}
          </section>
          <section className="subsection">
            <h2>Compare side by side</h2>
            {compared.length ? (
              <div className="comparison-scroll">
                <table className="comparison-table">
                  <caption className="sr-only">
                    Product comparison in {currency}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Product</th>
                      {compared.map((p) => (
                        <th scope="col" key={p.sku}>
                          <Link href={`/products/${p.slug}`}>{p.name}</Link>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">Price</th>
                      {compared.map((p) => (
                        <td key={p.sku}>
                          {formatMoney(p.prices[currency], currency)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th scope="row">Category</th>
                      {compared.map((p) => (
                        <td key={p.sku}>{p.category}</td>
                      ))}
                    </tr>
                    <tr>
                      <th scope="row">Features</th>
                      {compared.map((p) => (
                        <td key={p.sku}>
                          <ul>
                            {p.features.map((f) => (
                              <li key={f}>{f}</li>
                            ))}
                          </ul>
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th scope="row">Selection</th>
                      {compared.map((p) => (
                        <td key={p.sku}>
                          <SaveButtons sku={p.sku} />
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p>Select up to four products to compare prices and features.</p>
            )}
          </section>
          <section className="subsection">
            <h2>Recently viewed</h2>
            {recent.length ? (
              cards(recent)
            ) : (
              <p>Your recently viewed products will appear here.</p>
            )}
          </section>
          <p>
            <Link className="button dark" href="/#collection">
              Explore the collection ↗
            </Link>
          </p>
        </>
      )}
    </main>
  );
}
