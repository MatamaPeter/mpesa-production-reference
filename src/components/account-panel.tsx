"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { site } from "@/config/site";
import { formatMoney, type Currency } from "@/lib/catalog";
type Address = {
  name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  label: string;
};
type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  addresses: Address[];
  mfaEnabled: boolean;
  mfaVerified: boolean;
};
type Order = {
  _id: string;
  currency: Currency;
  amountMinor: number;
  totalPaidMinor?: number;
  status: string;
  fulfillment: string;
  createdAt: string;
};
export async function clientAPI(path: string, options?: RequestInit) {
  const r = await fetch(path, {
      ...options,
      headers: { "content-type": "application/json", ...options?.headers },
      cache: "no-store",
    }),
    data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Request failed");
  return data;
}
export function AccountPanel() {
  const [user, setUser] = useState<User | null>(null),
    [orders, setOrders] = useState<Order[]>([]),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [tab, setTab] = useState("orders"),
    [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null),
    [recovery, setRecovery] = useState<string[]>([]);
  async function refresh() {
    try {
      const data = await clientAPI("/api/account");
      setUser(data.user);
      setOrders(data.orders ?? []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Account unavailable");
    } finally {
      setReady(true);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    await action(async () => {
      const result = await clientAPI("/api/account/auth/request", {
        method: "POST",
        body: JSON.stringify({
          email: data.get("email"),
          name: data.get("name"),
        }),
      });
      setMessage(result.message);
    });
  }
  return (
    <main id="main" className="shell section">
      <span className="eyebrow">YOUR {site.brand.wordmark} ACCOUNT</span>
      <h1 className="page-title">
        A little more <em>yours.</em>
      </h1>
      {!ready ? (
        <p role="status">Loading account…</p>
      ) : !user ? (
        <div className="account-layout">
          <form className="admin-form" onSubmit={login}>
            <h2>Sign in or create an account</h2>
            <p className="fine-print">
              We’ll email you a secure, one-time link. No password to remember.
            </p>
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
              />
            </label>
            <label>
              Your name (optional)
              <input name="name" autoComplete="name" maxLength={100} />
            </label>
            <button className="button dark" disabled={busy}>
              {busy ? "Sending…" : "Email me a sign-in link"}
            </button>
            <p className="fine-print">
              Account sign-in requires the store’s email service to be
              configured. Checkout can still support guests.
            </p>
          </form>
          <aside className="order-summary">
            <h2>Keep the good things together.</h2>
            <p>
              Track orders across devices, save delivery addresses, keep a
              wishlist and manage returns from one place.
            </p>
            <Link href="/saved" className="text-link">
              Explore saved products ↗
            </Link>
          </aside>
        </div>
      ) : (
        <>
          <div className="admin-toolbar">
            <div>
              <strong>{user.name || user.email}</strong>
              <p className="fine-print">{user.email}</p>
            </div>
            <button
              className="button outline"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  await clientAPI("/api/account/logout", { method: "POST" });
                  window.dispatchEvent(new Event("account-changed"));
                  await refresh();
                })
              }
            >
              Sign out
            </button>
          </div>
          <div
            className="account-tabs"
            role="group"
            aria-label="Account sections"
          >
            {["orders", "profile", "security"].map((t) => (
              <button
                key={t}
                className={`button ${tab === t ? "dark" : "outline"}`}
                aria-pressed={tab === t}
                onClick={() => setTab(t)}
              >
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
            <Link className="button outline" href="/saved">
              Wishlist
            </Link>
            <Link className="button outline" href="/returns">
              Returns
            </Link>
            {user.role !== "customer" && (
              <Link className="button outline" href="/admin">
                Staff dashboard
              </Link>
            )}
          </div>
          {tab === "orders" && (
            <section>
              <h2>Your orders</h2>
              {!orders.length ? (
                <p>
                  No orders yet. Orders placed while signed in appear here.
                  Matching guest orders in this browser are linked when you sign
                  in.
                </p>
              ) : (
                orders.map((o) => (
                  <Link
                    className="account-order"
                    key={o._id}
                    href={`/orders/${o._id}`}
                  >
                    <span>
                      <strong>Order {o._id.slice(-8).toUpperCase()}</strong>
                      <small>
                        {new Date(o.createdAt).toLocaleDateString()} ·{" "}
                        {o.fulfillment}
                      </small>
                    </span>
                    <span>
                      {formatMoney(
                        o.totalPaidMinor ?? o.amountMinor,
                        o.currency,
                      )}
                      <small>{o.status}</small>
                    </span>
                  </Link>
                ))
              )}
            </section>
          )}
          {tab === "profile" && (
            <form
              className="admin-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void action(async () => {
                  await clientAPI("/api/account", {
                    method: "PATCH",
                    body: JSON.stringify({
                      name: f.get("name"),
                      addresses: user.addresses,
                    }),
                  });
                  await refresh();
                  setMessage("Profile saved");
                });
              }}
            >
              <h2>Your profile</h2>
              <label>
                Full name
                <input
                  name="name"
                  required
                  defaultValue={user.name}
                  maxLength={100}
                />
              </label>
              <button className="button dark" disabled={busy}>
                Save profile
              </button>
              <h3>Address book</h3>
              {user.addresses.map((a, i) => (
                <div key={i} className="address-card">
                  <strong>{a.label}</strong>
                  <p>
                    {a.name}
                    <br />
                    {a.line1}, {a.city}, {a.country}
                  </p>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() =>
                      action(async () => {
                        await clientAPI("/api/account", {
                          method: "PATCH",
                          body: JSON.stringify({
                            name: user.name || user.email,
                            addresses: user.addresses.filter(
                              (_, idx) => idx !== i,
                            ),
                          }),
                        });
                        await refresh();
                      })
                    }
                  >
                    Remove address
                  </button>
                </div>
              ))}
              <Link className="text-link" href="/account/address">
                Add a delivery address ↗
              </Link>
            </form>
          )}
          {tab === "security" && (
            <section className="security-panel">
              <h2>Account security</h2>
              <p>
                Authenticator verification is required for all staff access.
                Recovery codes are shown once; store them securely.
              </p>
              {!user.mfaEnabled && !setup && (
                <button
                  className="button dark"
                  disabled={busy}
                  onClick={() =>
                    action(async () => {
                      setSetup(
                        await clientAPI("/api/account/security", {
                          method: "POST",
                          body: JSON.stringify({ action: "setup" }),
                        }),
                      );
                    })
                  }
                >
                  Set up authenticator
                </button>
              )}
              {setup && (
                <div className="order-summary">
                  <p>Add this setup key to an authenticator app:</p>
                  <code className="setup-key">{setup.secret}</code>
                  <p>
                    <a href={setup.uri} className="text-link">
                      Open authenticator app
                    </a>
                  </p>
                </div>
              )}
              {(setup || user.mfaEnabled) && (
                <form
                  className="admin-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const code = new FormData(e.currentTarget).get("code");
                    void action(async () => {
                      const result = await clientAPI("/api/account/security", {
                        method: "POST",
                        body: JSON.stringify({
                          action: setup ? "activate" : "challenge",
                          code,
                        }),
                      });
                      setRecovery(result.recoveryCodes ?? []);
                      setSetup(null);
                      await refresh();
                      setMessage("Authenticator verified");
                    });
                  }}
                >
                  <label>
                    {setup
                      ? "Authenticator code"
                      : "Authenticator or recovery code"}
                    <input
                      name="code"
                      required
                      autoComplete="one-time-code"
                      maxLength={80}
                    />
                  </label>
                  <button className="button dark" disabled={busy}>
                    Verify authenticator
                  </button>
                </form>
              )}
              {user.mfaVerified && (
                <p className="status-pill">
                  Authenticator verified for this session
                </p>
              )}
              {recovery.length > 0 && (
                <div className="order-summary">
                  <h3>Save these recovery codes now</h3>
                  {recovery.map((code) => (
                    <p key={code}>
                      <code>{code}</code>
                    </p>
                  ))}
                </div>
              )}
              <button
                className="button outline"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    await clientAPI("/api/account", { method: "DELETE" });
                    await refresh();
                  })
                }
              >
                Sign out all devices
              </button>
              <p>
                <Link href="/api/account/export" className="text-link">
                  Download my personal data ↗
                </Link>
              </p>
            </section>
          )}
        </>
      )}
      {message && (
        <div className="feedback-box" role="status">
          {message}
        </div>
      )}
    </main>
  );
}
