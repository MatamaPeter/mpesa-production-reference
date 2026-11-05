"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCart } from "./cart-provider";
import { formatMoney, productImage, type ProductData } from "@/lib/catalog";
import { SaveButtons, useSaved } from "./saved-provider";
import { Reviews } from "./reviews";
import { Icon } from "./icons";
export function ProductDetail({
  product: p,
  live,
  variants = [],
}: {
  product: ProductData;
  live: boolean;
  variants?: ProductData[];
}) {
  const { currency, add, ready } = useCart(),
    [qty, setQty] = useState(1);
  const saved = useSaved(),
    zoom = useRef<HTMLDialogElement>(null);
  const [selectedImage, setSelectedImage] = useState(productImage(p.image));
  const gallery = [
    ...new Set([productImage(p.image), ...(p.images ?? []).map(productImage)]),
  ];
  useEffect(() => {
    saved.viewed(p.sku);
  }, [p.sku]);
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
          <button
            className="zoom-trigger"
            type="button"
            aria-label={`Enlarge ${p.name} image`}
            onClick={() => zoom.current?.showModal()}
          >
            <Image
              src={selectedImage}
              alt={p.name}
              width={700}
              height={700}
              priority
            />
          </button>
          {!live && <span className="product-tag">CONCEPT PRODUCT</span>}
        </div>
        <div className="detail-copy">
          <span className="eyebrow">THE {p.category.toUpperCase()} EDIT</span>
          <h1>{p.name}</h1>
          <p className="detail-tagline">{p.tagline}</p>
          {gallery.length > 1 && (
            <div
              className="gallery-thumbnails"
              role="group"
              aria-label="Product images"
            >
              {gallery.map((src, i) => (
                <button
                  key={src}
                  aria-label={`View product image ${i + 1}`}
                  aria-pressed={selectedImage === src}
                  onClick={() => setSelectedImage(src)}
                >
                  <Image src={src} alt="" width={75} height={75} />
                </button>
              ))}
            </div>
          )}
          <p className="fine-print">SKU: {p.sku}</p>
          <div className="detail-price">
            {formatMoney(p.prices[currency], currency)}
          </div>
          <p>{p.description}</p>
          {variants.length > 1 && (
            <label className="variant-select">
              Choose a variant
              <select
                value={p.slug}
                onChange={(e) => {
                  window.location.href = `/products/${e.target.value}`;
                }}
              >
                {variants.map((v) => (
                  <option key={v.sku} value={v.slug}>
                    {v.attributes
                      ?.map((a) => `${a.name}: ${a.value}`)
                      .join(" · ") || v.name}
                    {v.stock === 0 ? " — Out of stock" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!!p.specifications?.length && (
            <dl className="specifications">
              {p.specifications.map((a) => (
                <div key={a.name}>
                  <dt>{a.name}</dt>
                  <dd>{a.value}</dd>
                </div>
              ))}
            </dl>
          )}
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
          <SaveButtons sku={p.sku} />
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
      <dialog
        ref={zoom}
        className="image-dialog"
        aria-label={`${p.name} image preview`}
      >
        <button
          className="button outline"
          onClick={() => zoom.current?.close()}
        >
          Close image
        </button>
        <Image src={selectedImage} alt={p.name} width={1400} height={1400} />
      </dialog>
      <Reviews sku={p.sku} />
    </main>
  );
}
