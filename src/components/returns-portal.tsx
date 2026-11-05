"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { clientAPI } from "./account-panel";
import { operationKey } from "@/lib/client-idempotency";
import { storageKey, site } from "@/config/site";
type ReturnView = {
  _id: string;
  orderId: string;
  status: string;
  reason: string;
  items: { sku: string; qty: number }[];
  restocked: boolean;
};
export function ReturnsPortal({
  initialOrderId = "",
}: {
  initialOrderId?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [orderLines, setOrderLines] = useState<
      { sku: string; name: string; qty: number }[]
    >([]),
    [loadedOrder, setLoadedOrder] = useState("");
  async function lookupOrder() {
    try {
      const id = String(new FormData(formRef.current!).get("orderId"));
      const data = await clientAPI(`/api/orders/${encodeURIComponent(id)}`);
      setOrderLines(data.items);
      setLoadedOrder(id);
      setMessage("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not load order");
    }
  }
  const [items, setItems] = useState<ReturnView[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      const data = await clientAPI("/api/returns");
      setItems(data.items);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Returns unavailable");
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <main id="main" className="shell section">
      <span className="eyebrow">LET’S MAKE IT RIGHT</span>
      <h1 className="page-title">
        Returns, <em>considered.</em>
      </h1>
      <p>
        Sign in or use the browser that placed your order. Delivered orders
        within the configured {site.policy.returnWindowDays}-day return window
        can be submitted for review. Eligibility remains subject to the{" "}
        <Link href="/policies/returns">approved store policy</Link>.
      </p>
      <div className="account-layout">
        <form
          className="admin-form"
          ref={formRef}
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const form = e.currentTarget,
              f = new FormData(form);
            try {
              if (loadedOrder !== f.get("orderId"))
                throw new Error("Load your order before requesting a return");
              const body = {
                orderId: f.get("orderId"),
                items: [{ sku: f.get("sku"), qty: Number(f.get("qty")) }],
                reason: f.get("reason"),
              };
              const requestId = await operationKey("return", body);
              const result = await clientAPI("/api/returns", {
                method: "POST",
                body: JSON.stringify({ ...body, requestId }),
              });
              setMessage(
                `Return request ${result.id} received. Wait for instructions before shipping anything.`,
              );
              try {
                sessionStorage.removeItem(storageKey("operation:return"));
              } catch {}
              form.reset();
              setLoadedOrder("");
              setOrderLines([]);
              await refresh();
            } catch (e) {
              setMessage(
                e instanceof Error ? e.message : "Could not request return",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>Request a return</h2>
          <label>
            Order reference
            <input
              name="orderId"
              defaultValue={initialOrderId}
              required
              pattern="[a-fA-F0-9]{24}"
              maxLength={24}
            />
          </label>
          <button
            className="button outline"
            type="button"
            onClick={lookupOrder}
          >
            Load order items
          </button>
          <label>
            Product
            <select name="sku" required disabled={!orderLines.length}>
              <option value="">Select an item from your order</option>
              {orderLines.map((i) => (
                <option key={i.sku} value={i.sku}>
                  {i.name} · {i.sku} · purchased {i.qty}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quantity
            <input
              name="qty"
              type="number"
              min={1}
              max={10}
              defaultValue={1}
              required
            />
          </label>
          <label>
            Reason
            <textarea name="reason" required minLength={10} maxLength={3000} />
          </label>
          <button className="button dark" disabled={busy}>
            Request return review
          </button>
        </form>
        <section>
          <h2>Your return requests</h2>
          {items.length ? (
            items.map((r) => (
              <article className="address-card" key={r._id}>
                <h3>{r._id.slice(-8).toUpperCase()}</h3>
                <p>
                  {r.status} · Order {r.orderId}
                </p>
                <p>{r.items.map((i) => `${i.sku} × ${i.qty}`).join(", ")}</p>
                <p>{r.reason}</p>
              </article>
            ))
          ) : (
            <p>No return requests to display.</p>
          )}
        </section>
      </div>
      {message && (
        <p className="feedback-box" role="status">
          {message}
        </p>
      )}
    </main>
  );
}
