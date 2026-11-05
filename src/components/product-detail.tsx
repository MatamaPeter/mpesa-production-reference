"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useCart } from "./cart-provider";
import { formatMoney, productImage, type ProductData } from "@/lib/catalog";
import { Icon } from "./icons";
export function ProductDetail({
  product: p,
  live,
}: {
  product: ProductData;
  live: boolean;
}) {
  const { currency, add, ready } = useCart(),
    [qty, setQty] = useState(1);
  return (
    <main id="main" className="shell section">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span>/</span>
        <Link href="/#collection">Collection</Link>
        <span>/</span>
        <span>{p.name}</span>
      </nav>
      <div className="product-detail">
        <div className={`detail-art art-${p.image}`}>
          <Image
            src={productImage(p.image)}
            alt={p.name}
            width={700}
            height={700}
            priority
          />
          {!live && <span className="product-tag">CONCEPT PRODUCT</span>}
        </div>
        <div className="detail-copy">
          <span className="eyebrow">THE {p.category.toUpperCase()} EDIT</span>
          <h1>{p.name}</h1>
          <p className="detail-tagline">{p.tagline}</p>
          <div className="detail-price">
            {formatMoney(p.prices[currency], currency)}
          </div>
          <p>{p.description}</p>
          <ul className="feature-list">
            {p.features.map((f) => (
              <li key={f}>
                <Icon name="check" />
                {f}
              </li>
            ))}
          </ul>
          {!live && (
            <div className="draft-note">
              This is a preview product with illustrative pricing. Not currently
              offered for sale.
            </div>
          )}
          <div className="purchase-controls">
            <div className="quantity">
              <button
                aria-label="Decrease quantity"
                disabled={qty === 1}
                onClick={() => setQty((q) => q - 1)}
              >
                <Icon name="minus" />
              </button>
              <output aria-label="Quantity">{qty}</output>
              <button
                aria-label="Increase quantity"
                disabled={qty === 10}
                onClick={() => setQty((q) => q + 1)}
              >
                <Icon name="plus" />
              </button>
            </div>
            <button
              className="button dark"
              disabled={!ready || (live && p.stock === 0)}
              onClick={() => add(p.sku, qty)}
            >
              {live
                ? p.stock > 0
                  ? "Add to bag"
                  : "Out of stock"
                : "Add to preview bag"}
              <Icon name="bag" />
            </button>
          </div>
          <p className="fine-print">
            Delivery, taxes and payment options are confirmed at checkout.{" "}
            <Link href="/policies/returns">
              Returns & warranty information ↗
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
