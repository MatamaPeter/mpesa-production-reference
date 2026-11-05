"use client";
import { useState } from "react";
import { clientAPI } from "./account-panel";
export function ContactForm() {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="admin-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const f = new FormData(e.currentTarget);
        try {
          const result = await clientAPI("/api/support", {
            method: "POST",
            body: JSON.stringify(
              Object.fromEntries(
                ["name", "email", "topic", "subject", "message", "website"].map(
                  (k) => [k, String(f.get(k) ?? "")],
                ),
              ),
            ),
          });
          setMessage(`Your request was received. Reference: ${result.id}`);
        } catch (e) {
          setMessage(e instanceof Error ? e.message : "Support unavailable");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Your name
        <input name="name" required autoComplete="name" maxLength={100} />
      </label>
      <label>
        Email address
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          maxLength={254}
        />
      </label>
      <label>
        How can we help?
        <select name="topic">
          <option value="order">Order help</option>
          <option value="product">Product question</option>
          <option value="return">Returns</option>
          <option value="privacy">Privacy / account deletion</option>
          <option value="other">Something else</option>
        </select>
      </label>
      <label>
        Subject
        <input name="subject" required minLength={3} maxLength={160} />
      </label>
      <label>
        Your message
        <textarea name="message" required minLength={10} maxLength={5000} />
      </label>
      <label className="sr-only" aria-hidden="true">
        Leave this blank
        <input name="website" autoComplete="off" tabIndex={-1} />
      </label>
      <button className="button dark" disabled={busy}>
        {busy ? "Sending…" : "Send support request"}
      </button>
      {message && (
        <p role="status" className="feedback-box">
          {message}
        </p>
      )}
    </form>
  );
}
