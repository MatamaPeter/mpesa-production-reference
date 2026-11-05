"use client";
import { site } from "@/config/site";
import { useEffect, useState } from "react";
import Link from "next/link";
import { clientAPI } from "./account-panel";
type Review = {
  _id: string;
  displayName: string;
  rating: number;
  title: string;
  body: string;
  verifiedPurchase: boolean;
  createdAt: string;
};
export function Reviews({ sku }: { sku: string }) {
  const [data, setData] = useState<{
      items: Review[];
      count: number;
      average: number;
    }>({ items: [], count: 0, average: 0 }),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch(`/api/reviews?sku=${encodeURIComponent(sku)}`)
      .then((r) => r.json())
      .then((data) => {
        if (active && Array.isArray(data.items)) setData(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [sku]);
  if (!site.features.reviews) return null;
  return (
    <section className="subsection reviews">
      <div className="section-heading">
        <div>
          <span className="eyebrow">FROM REAL CUSTOMERS</span>
          <h2>
            What people <em>think.</em>
          </h2>
        </div>
        <p>
          {data.count
            ? `${data.average.toFixed(1)} / 5 · ${data.count} verified reviews`
            : "No published reviews yet"}
        </p>
      </div>
      {data.items.map((r) => (
        <article className="review-card" key={r._id}>
          <div aria-label={`${r.rating} out of 5 stars`}>
            {"★".repeat(r.rating)}
            {"☆".repeat(5 - r.rating)}
          </div>
          <h3>{r.title}</h3>
          <p>{r.body}</p>
          <small>
            {r.displayName} ·{" "}
            {r.verifiedPurchase ? "Verified purchase" : "Customer"} ·{" "}
            {new Date(r.createdAt).toLocaleDateString()}
          </small>
        </article>
      ))}
      <details className="review-form">
        <summary>Write a verified-purchase review</summary>
        <p className="fine-print">
          You must <Link href="/account">sign in</Link> and have purchased this
          product. Reviews are moderated before publication.
        </p>
        <form
          className="admin-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const f = new FormData(e.currentTarget);
            try {
              const result = await clientAPI("/api/reviews", {
                method: "POST",
                body: JSON.stringify({
                  sku,
                  rating: Number(f.get("rating")),
                  title: f.get("title"),
                  body: f.get("body"),
                }),
              });
              setMessage(result.message);
            } catch (e) {
              setMessage(
                e instanceof Error ? e.message : "Could not save review",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Rating
            <select name="rating" required>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} stars
                </option>
              ))}
            </select>
          </label>
          <label>
            Review title
            <input name="title" required minLength={3} maxLength={100} />
          </label>
          <label>
            Your experience
            <textarea name="body" required minLength={10} maxLength={3000} />
          </label>
          <button className="button dark" disabled={busy}>
            Submit review
          </button>
        </form>
      </details>
      {message && (
        <p role="status" className="feedback-box">
          {message}
        </p>
      )}
    </section>
  );
}
