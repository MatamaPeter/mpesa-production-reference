"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart } from "./cart-provider";
import { formatMoney, type Currency } from "@/lib/catalog";
interface OrderView {
  id: string;
  currency: Currency;
  amountMinor: number;
  totalPaidMinor: number | null;
  status: string;
  paymentMethod: "stripe" | "mpesa" | null;
  activePaymentId: string | null;
  paymentStatus: string | null;
  mpesaQuoteMinor: number | null;
  mpesaTaxMinor: number | null;
  cardAvailable: boolean;
  fulfillment: string;
  trackingNumber: string;
  items: { sku: string; name: string; qty: number; unitPrice: number }[];
}
export function OrderStatus({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<OrderView | null>(null),
    [error, setError] = useState(""),
    [phone, setPhone] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [paymentId, setPaymentId] = useState<string | null>(null),
    [paymentState, setPaymentState] = useState<string | null>(null),
    { items, update } = useCart();
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function load() {
      try {
        const r = await fetch(`/api/orders/${orderId}`, {
            cache: "no-store",
            signal: controller.signal,
          }),
          data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Could not load order");
        if (!cancelled) {
          setOrder(data);
          if (data.activePaymentId) {
            setPaymentId(data.activePaymentId);
            setPaymentState(data.paymentStatus);
          }
          setError("");
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Order unavailable");
      }
    }
    void load();
    const timer = setInterval(load, 6000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [orderId]);
  // Remove only the paid order's quantities, not unrelated additions to the bag.
  useEffect(() => {
    if (order?.status !== "paid") return;
    const key = `leron-cleared-${order.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      sessionStorage.removeItem("leron-checkout-request");
      for (const line of order.items) {
        const existing = items.find((i) => i.sku === line.sku);
        if (existing) update(line.sku, Math.max(0, existing.qty - line.qty));
      }
    } catch {}
  }, [order, items, update]);
  useEffect(() => {
    if (!paymentId) return;
    let active = true;
    async function poll() {
      try {
        const r = await fetch(`/api/mpesa/status/${paymentId}`, {
            cache: "no-store",
          }),
          data = await r.json();
        if (r.ok && active) {
          setPaymentState(data.status);
          setMessage(
            data.status === "success"
              ? "Payment verified."
              : data.status === "review"
                ? "Payment needs review. Do not pay again."
                : data.status === "failed"
                  ? "Payment was not completed. Contact the store before retrying."
                  : "Check your phone. Do not pay twice.",
          );
        }
      } catch {}
    }
    void poll();
    const timer = setInterval(poll, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [paymentId]);
  async function mpesa() {
    if (busy || paymentState) return;
    setBusy(true);
    try {
      const r = await fetch("/api/mpesa/stk-push", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            orderId,
            phone,
            expectedTotalMinor: order?.mpesaQuoteMinor,
          }),
        }),
        data = await r.json();
      if (data.paymentId) {
        setPaymentId(data.paymentId);
        setPaymentState(data.status ?? "review");
      }
      if (!r.ok) throw new Error(data.error ?? "Payment unavailable");
      setMessage("Check your phone for the M-Pesa prompt. Do not pay twice.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Payment unavailable");
    } finally {
      setBusy(false);
    }
  }
  async function card() {
    setBusy(true);
    try {
      const r = await fetch("/api/payments/stripe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderId }),
        }),
        data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Payment unavailable");
      const url = new URL(data.url);
      if (url.hostname !== "checkout.stripe.com" || url.protocol !== "https:")
        throw new Error("Unexpected payment destination");
      location.assign(url.toString());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Payment unavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main" className="shell section order-page">
      <span className="eyebrow">YOUR LERON ORDER</span>
      <h1 className="page-title">
        {order?.status === "paid" ? (
          <>
            Good things.
            <br />
            <em>On their way.</em>
          </>
        ) : (
          <>
            Let’s keep you
            <br />
            <em>in the loop.</em>
          </>
        )}
      </h1>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {!order && !error && <p role="status">Loading order…</p>}
      {order && (
        <div className="order-summary">
          <p className="fine-print">Reference {order.id}</p>
          <div className="summary-line">
            <span>Payment</span>
            <strong className="status-pill">{order.status}</strong>
          </div>
          <div className="summary-line">
            <span>Fulfillment</span>
            <strong>{order.fulfillment}</strong>
          </div>
          {order.trackingNumber && (
            <p>Tracking reference: {order.trackingNumber}</p>
          )}
          {order.items.map((i) => (
            <div className="summary-line" key={i.sku}>
              <span>
                {i.name} × {i.qty}
              </span>
              <strong>
                {formatMoney(i.qty * i.unitPrice, order.currency)}
              </strong>
            </div>
          ))}
          <div className="summary-total">
            <span>
              {order.status === "paid" ? "Total paid" : "Before provider tax"}
            </span>
            <strong>
              {formatMoney(
                order.totalPaidMinor ?? order.amountMinor,
                order.currency,
              )}
            </strong>
          </div>
          {order.status === "unpaid" && (
            <div className="payment-resume">
              <button
                className="button dark"
                onClick={card}
                disabled={
                  busy ||
                  !order.cardAvailable ||
                  order.paymentMethod === "mpesa"
                }
              >
                Continue with card
              </button>
              {order.mpesaQuoteMinor !== null && (
                <>
                  <label>
                    M-Pesa phone number
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      type="tel"
                      placeholder="07XXXXXXXX"
                      maxLength={20}
                    />
                  </label>
                  <p className="fine-print">
                    M-Pesa total:{" "}
                    {formatMoney(order.mpesaQuoteMinor, order.currency)}{" "}
                    (includes{" "}
                    {formatMoney(order.mpesaTaxMinor ?? 0, order.currency)}{" "}
                    tax).
                  </p>
                  <button
                    className="button outline"
                    onClick={mpesa}
                    disabled={
                      busy ||
                      order.paymentMethod === "stripe" ||
                      !!paymentState ||
                      !/^(?:0|254|\+254)[17]\d{8}$/.test(
                        phone.replace(/\s/g, ""),
                      )
                    }
                  >
                    Pay with M-Pesa
                  </button>
                </>
              )}
              {message && <p role="status">{message}</p>}
            </div>
          )}
          {order.status === "review" && (
            <p role="alert">
              This payment needs manual verification. Do not pay again.
            </p>
          )}
          <p className="fine-print">
            Payment is confirmed by the server after provider verification.
            Returning from a payment page does not itself confirm payment. Keep
            this browser session to access your order.
          </p>
        </div>
      )}
      <Link className="text-link" href="/#collection">
        Back to the collection ↗
      </Link>
    </main>
  );
}
