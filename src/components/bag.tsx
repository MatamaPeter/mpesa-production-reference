"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCart, resolveCart } from "./cart-provider";
import { formatMoney, productImage, type ProductData } from "@/lib/catalog";
import { Icon } from "./icons";
export function Bag({
  products,
  live,
}: {
  products: ProductData[];
  live: boolean;
}) {
  const { items, currency, update, ready } = useCart();
  const [resolved, setResolved] = useState(products);
  useEffect(() => {
    const missing = items
      .map((i) => i.sku)
      .filter((sku) => !resolved.some((p) => p.sku === sku));
    if (!missing.length) return;
    const controller = new AbortController();
    void fetch(`/api/catalog?skus=${missing.join(",")}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.items) && data.items.length)
          setResolved((current) => [...current, ...data.items]);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [items, resolved]);
  const lines = resolveCart(items, resolved),
    subtotal = lines.reduce(
      (n, l) => n + (l.product?.prices[currency] ?? 0) * l.item.qty,
      0,
    ),
    invalid = lines.some(
      (l) => !l.product || (live && l.product.stock < l.item.qty),
    );
  return (
    <main id="main" className="shell section">
      <span className="eyebrow">GOOD CHOICES, ALL TOGETHER</span>
      <h1 className="page-title">
        Your <em>bag.</em>
      </h1>
      {!ready ? (
        <p role="status">Loading your bag…</p>
      ) : !items.length ? (
        <div className="empty-state">
          <Icon name="bag" width={50} height={50} />
          <h2>Room for something good.</h2>
          <p>Your next everyday essential is waiting.</p>
          <Link href="/#collection" className="button dark">
            Explore the collection <Icon name="arrow" />
          </Link>
        </div>
      ) : (
        <div className="bag-layout">
          <div className="bag-lines">
            {lines.map(({ item, product: p }) => (
              <article className="bag-item" key={item.sku}>
                {p ? (
                  <>
                    <Link
                      className={`bag-art art-${p.image}`}
                      href={`/products/${p.slug}`}
                    >
                      <Image
                        src={productImage(p.image)}
                        alt={p.name}
                        width={170}
                        height={170}
                      />
                    </Link>
                    <div>
                      <span className="product-category">{p.category}</span>
                      <h2>
                        <Link href={`/products/${p.slug}`}>{p.name}</Link>
                      </h2>
                      <p>{formatMoney(p.prices[currency], currency)}</p>
                      <div className="quantity">
                        <button
                          aria-label={`Decrease ${p.name} quantity`}
                          onClick={() => update(p.sku, item.qty - 1)}
                        >
                          <Icon name="minus" />
                        </button>
                        <output>{item.qty}</output>
                        <button
                          aria-label={`Increase ${p.name} quantity`}
                          disabled={item.qty >= 10}
                          onClick={() => update(p.sku, item.qty + 1)}
                        >
                          <Icon name="plus" />
                        </button>
                      </div>
                      {live && p.stock < item.qty && (
                        <p className="error-text">
                          Only {p.stock} available. Update your quantity.
                        </p>
                      )}
                    </div>
                    <div className="bag-item-end">
                      <strong>
                        {formatMoney(p.prices[currency] * item.qty, currency)}
                      </strong>
                      <button
                        className="text-button"
                        onClick={() => update(p.sku, 0)}
                      >
                        Remove
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p>This product is no longer available.</p>
                    <button onClick={() => update(item.sku, 0)}>
                      Remove item
                    </button>
                  </>
                )}
              </article>
            ))}
            <Link href="/#collection" className="text-link">
              ← Continue exploring
            </Link>
          </div>
          <aside className="order-summary">
            <span className="eyebrow">THE OVERVIEW</span>
            <h2>A little upgrade.</h2>
            <div className="summary-line">
              <span>Subtotal</span>
              <strong>{formatMoney(subtotal, currency)}</strong>
            </div>
            <div className="summary-line">
              <span>Delivery & tax</span>
              <span>At checkout</span>
            </div>
            <p className="fine-print">
              Prices shown in {currency}. Your selected currency is preserved
              through payment.
            </p>
            {!live && (
              <div className="draft-note">
                You’re exploring a draft collection. Checkout is not open and no
                payments can be taken.
              </div>
            )}
            <Link href="/checkout" className="button dark">
              {live ? "Continue to checkout" : "Preview checkout"}
              <Icon name="arrow" />
            </Link>
            {invalid && (
              <p className="error-text">
                Please resolve unavailable items before checking out.
              </p>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
