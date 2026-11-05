"use client";
import { useEffect, useState } from "react";
type Status =
  | "idle"
  | "creating"
  | "prompting"
  | "pending"
  | "success"
  | "failed"
  | "review";
export default function CheckoutPage() {
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!paymentId || status !== "pending") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/mpesa/status/${paymentId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (["success", "failed", "review"].includes(data.status)) {
          setStatus(data.status);
          setMessage(
            data.status === "success"
              ? "Checkout verified. Thank you!"
              : data.status === "review"
                ? "Payment needs verification. Do not pay again."
                : "Payment was not completed.",
          );
        }
      } catch {
        /* Continue polling while connected. */
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [paymentId, status]);
  async function checkout() {
    try {
      setMessage("");
      setStatus("creating");
      const orderResponse = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ sku: "tshirt", qty: 1 }] }),
      });
      const order = await orderResponse.json();
      if (!orderResponse.ok) throw new Error(order.error ?? "Order failed");
      setStatus("prompting");
      const pushResponse = await fetch("/api/mpesa/stk-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.orderId, phone }),
      });
      const push = await pushResponse.json();
      if (push.paymentId) setPaymentId(push.paymentId);
      if (!pushResponse.ok) {
        setStatus("review");
        throw new Error(push.error ?? "Payment initiation uncertain");
      }
      setStatus("pending");
      setMessage("Check your phone for the M-Pesa prompt. Do not pay twice.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong");
      setStatus((s) => (s === "review" ? s : "failed"));
    }
  }
  return (
    <main
      style={{
        maxWidth: 480,
        margin: "60px auto",
        fontFamily: "system-ui",
        padding: 20,
      }}
    >
      <h1>M-Pesa Checkout</h1>
      <p>Foundation T-shirt — KES 1,500</p>
      <label htmlFor="phone">M-Pesa phone number</label>
      <input
        id="phone"
        placeholder="07XXXXXXXX"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        style={{
          display: "block",
          padding: 12,
          width: "100%",
          margin: "12px 0",
        }}
      />
      <button
        onClick={checkout}
        disabled={
          !/^(?:0|254|\+254)[17]\d{8}$/.test(phone.replace(/\s/g, "")) ||
          !["idle", "failed"].includes(status)
        }
        style={{ padding: 12 }}
      >
        Pay with M-Pesa
      </button>
      <p role="status">Status: {status}</p>
      <p>{message}</p>
    </main>
  );
}
