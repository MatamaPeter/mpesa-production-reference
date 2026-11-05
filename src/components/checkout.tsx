"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useCart, resolveCart } from "./cart-provider";
import { formatMoney, type ProductData } from "@/lib/catalog";
import { Icon } from "./icons";
export function Checkout({
  products,
  live,
  countries,
  cardEnabled,
  mpesaEnabled,
}: {
  products: ProductData[];
  live: boolean;
  countries: string[];
  cardEnabled: boolean;
  mpesaEnabled: boolean;
}) {
  const { items, currency, ready } = useCart(),
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [method, setMethod] = useState("stripe");
  const request = useRef<{ key: string; body: string } | null>(null),
    pendingOrder = useRef<string | null>(null);
  const lines = resolveCart(items, products),
    subtotal = lines.reduce(
      (sum, { item, product }) =>
        sum + (product?.prices[currency] ?? 0) * item.qty,
      0,
    );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !live) return;
    setError("");
    setBusy(true);
    try {
      const form = new FormData(e.currentTarget),
        address = Object.fromEntries(
          [
            "name",
            "email",
            "phone",
            "line1",
            "line2",
            "city",
            "region",
            "postalCode",
            "country",
          ].map((k) => [k, String(form.get(k) ?? "")]),
        ),
        body = JSON.stringify({ items, currency, address });
      const fingerprint = Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)),
        ),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      try {
        const saved = JSON.parse(
          sessionStorage.getItem("leron-checkout-request") ?? "null",
        );
        if (
          saved?.fingerprint === fingerprint &&
          typeof saved.key === "string"
        ) {
          request.current = { key: saved.key, body };
          pendingOrder.current =
            typeof saved.orderId === "string" ? saved.orderId : null;
        }
      } catch {}
      if (!request.current || request.current.body !== body) {
        if (pendingOrder.current)
          throw new Error(
            "An order has already been reserved. Open it before starting a different checkout.",
          );
        request.current = { key: crypto.randomUUID(), body };
      }
      try {
        sessionStorage.setItem(
          "leron-checkout-request",
          JSON.stringify({
            key: request.current.key,
            fingerprint,
            orderId: pendingOrder.current,
          }),
        );
      } catch {}
      let orderId = pendingOrder.current;
      if (!orderId) {
        const r = await fetch("/api/orders", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": request.current.key,
          },
          body,
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Could not create order");
        orderId = data.orderId;
        pendingOrder.current = orderId;
        try {
          sessionStorage.setItem(
            "leron-checkout-request",
            JSON.stringify({ key: request.current.key, fingerprint, orderId }),
          );
        } catch {}
      }
      if (method === "mpesa") {
        router.push(`/orders/${orderId}?pay=mpesa`);
        return;
      }
      const r = await fetch("/api/payments/stripe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Payment unavailable");
      const url = new URL(data.url);
      if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com")
        throw new Error("Unexpected payment destination");
      window.location.assign(url.toString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout unavailable");
    } finally {
      setBusy(false);
    }
  }
  const fields = [
    { name: "name", label: "Full name", auto: "name", required: true },
    {
      name: "email",
      label: "Email address",
      auto: "email",
      type: "email",
      required: true,
    },
    {
      name: "phone",
      label: "Phone number",
      auto: "tel",
      type: "tel",
      required: true,
    },
    {
      name: "line1",
      label: "Street address",
      auto: "address-line1",
      required: true,
    },
    {
      name: "line2",
      label: "Apartment, suite, etc. (optional)",
      auto: "address-line2",
    },
    { name: "city", label: "City", auto: "address-level2", required: true },
    {
      name: "region",
      label: "State / county / region",
      auto: "address-level1",
    },
    { name: "postalCode", label: "Postal code", auto: "postal-code" },
  ];
  return (
    <main id="main" className="shell section">
      <nav className="breadcrumb" aria-label="Checkout steps">
        <Link href="/cart">Your bag</Link>
        <span>→</span>
        <span>Delivery & payment</span>
      </nav>
      <h1 className="page-title">
        Almost <em>yours.</em>
      </h1>
      {!live && (
        <div className="draft-note checkout-notice">
          Preview mode. Products, delivery rates and policies are awaiting
          approval. This form will not submit orders or take payments.
        </div>
      )}
      {!ready ? (
        <p>Loading your bag…</p>
      ) : !items.length ? (
        <div className="empty-state">
          <h2>Your bag is empty.</h2>
          <Link className="button dark" href="/#collection">
            Explore the collection
          </Link>
        </div>
      ) : (
        <div className="bag-layout">
          <form className="checkout-form" onSubmit={submit}>
            <fieldset disabled={!live || busy}>
              <legend>
                <span>01</span> Delivery details
              </legend>
              <div className="form-grid">
                {fields.map((f) => (
                  <label
                    key={f.name}
                    className={f.name.startsWith("line") ? "full" : ""}
                  >
                    {f.label}
                    <input
                      name={f.name}
                      type={f.type ?? "text"}
                      autoComplete={f.auto}
                      required={f.required}
                      maxLength={f.name === "email" ? 254 : 160}
                    />
                  </label>
                ))}
                <label className="full">
                  Country
                  <select name="country" required defaultValue="">
                    <option value="" disabled>
                      Select your destination
                    </option>
                    {countries.map((c) => (
                      <option key={c} value={c}>
                        {new Intl.DisplayNames(["en"], { type: "region" }).of(
                          c,
                        )}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <h2 className="second-legend">
                <span>02</span> Payment method
              </h2>
              <label className="payment-option">
                <input
                  type="radio"
                  name="payment"
                  value="stripe"
                  checked={method === "stripe"}
                  onChange={() => setMethod("stripe")}
                  disabled={!cardEnabled}
                />
                <span>
                  <strong>Credit or debit card</strong>
                  <small>
                    Secure hosted checkout by Stripe. Tax calculated before
                    payment.
                  </small>
                </span>
                <span className="payment-brand">CARD</span>
              </label>
              <label className="payment-option">
                <input
                  type="radio"
                  name="payment"
                  value="mpesa"
                  checked={method === "mpesa"}
                  onChange={() => setMethod("mpesa")}
                  disabled={!mpesaEnabled || currency !== "KES"}
                />
                <span>
                  <strong>M-Pesa</strong>
                  <small>Kenyan mobile numbers · KES orders only</small>
                </span>
                <span className="payment-brand">M-PESA</span>
              </label>
              <p className="fine-print">
                By continuing, you agree to the{" "}
                <Link href="/policies/terms">terms of sale</Link> and
                acknowledge the{" "}
                <Link href="/policies/privacy">privacy notice</Link>.
              </p>
              <button
                className="button dark"
                disabled={
                  !live ||
                  busy ||
                  !countries.length ||
                  (method === "stripe"
                    ? !cardEnabled
                    : !mpesaEnabled || currency !== "KES")
                }
              >
                {busy ? "Preparing your order…" : "Continue to payment"}
                <Icon name="arrow" />
              </button>
            </fieldset>
            {error && (
              <div role="alert" className="error-box">
                {error}
                {pendingOrder.current && (
                  <p>
                    <Link href={`/orders/${pendingOrder.current}`}>
                      Open your reserved order →
                    </Link>
                  </p>
                )}
              </div>
            )}
          </form>
          <aside className="order-summary">
            <span className="eyebrow">YOUR SELECTION</span>
            <h2>The good stuff.</h2>
            {lines.map(({ item, product: p }) => (
              <div className="summary-line" key={item.sku}>
                <span>
                  {p?.name ?? "Unavailable item"} × {item.qty}
                </span>
                <strong>
                  {p
                    ? formatMoney(p.prices[currency] * item.qty, currency)
                    : "—"}
                </strong>
              </div>
            ))}
            <div className="summary-total">
              <span>Subtotal</span>
              <strong>{formatMoney(subtotal, currency)}</strong>
            </div>
            <p className="fine-print">
              Delivery is confirmed for your destination. Card tax is calculated
              by Stripe before payment. M-Pesa requires an approved local tax
              configuration. Import duties, if applicable, must be disclosed in
              the approved shipping policy.
            </p>
            <Link className="text-link" href="/cart">
              Edit your bag ↗
            </Link>
          </aside>
        </div>
      )}
    </main>
  );
}
