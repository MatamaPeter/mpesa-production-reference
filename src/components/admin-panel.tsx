"use client";
import { decimalToMinor, minorToDecimal, currencyDigits } from "@/lib/money";
import Link from "next/link";
import { site, storageKey } from "@/config/site";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { formatMoney, type ProductData, type Currency } from "@/lib/catalog";
type AdminOrder = {
  _id: string;
  currency: Currency;
  amountMinor: number;
  status: string;
  fulfillment: string;
  trackingNumber: string;
  createdAt: string;
  address: {
    name: string;
    email: string;
    phone: string;
    line1: string;
    line2: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
  };
  items: { name: string; qty: number }[];
};
async function api(url: string, options?: RequestInit) {
  const r = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", ...options?.headers },
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Request failed");
  return data;
}
const newProduct: ProductData = {
  sku: "",
  slug: "",
  name: "",
  category: site.categories[0] ?? "General",
  tagline: "",
  description: "",
  prices: { USD: 100, KES: 100 },
  image: "headphones",
  features: [],
  stock: 0,
  active: false,
  featured: false,
};
export function AdminPanel({ authenticated }: { authenticated: boolean }) {
  const router = useRouter(),
    [tab, setTab] = useState("products"),
    [products, setProducts] = useState<ProductData[]>([]),
    [orders, setOrders] = useState<AdminOrder[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(authenticated);
  const [productCursor, setProductCursor] = useState<string | null>(null),
    [orderCursor, setOrderCursor] = useState<string | null>(null);
  async function loadMore() {
    setBusy(true);
    try {
      const result = await api(
        `/api/admin/${tab}?cursor=${encodeURIComponent(tab === "products" ? productCursor! : orderCursor!)}`,
      );
      if (tab === "products") {
        setProducts((old) => [...old, ...result.items]);
        setProductCursor(result.nextCursor);
      } else {
        setOrders((old) => [...old, ...result.items]);
        setOrderCursor(result.nextCursor);
      }
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Could not load more records",
      );
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setLoading(true);
    try {
      const [p, o] = await Promise.all([
        api("/api/admin/products"),
        api("/api/admin/orders"),
      ]);
      setProducts(p.items ?? p);
      setProductCursor(p.nextCursor ?? null);
      setOrderCursor(o.nextCursor ?? null);
      setOrders(o.items ?? o);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not load store");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (authenticated) void refresh();
  }, [authenticated]);
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = new FormData(e.currentTarget).get("password");
    setBusy(true);
    setMessage("");
    try {
      await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sign-in unavailable");
    } finally {
      setBusy(false);
    }
  }
  async function seed() {
    setBusy(true);
    try {
      await api("/api/admin/products", {
        method: "POST",
        body: JSON.stringify({ action: "seed-drafts" }),
      });
      await refresh();
      setMessage(
        "Draft products imported inactive with zero stock. Review and verify all product details before activation.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main" className="shell section admin-page">
      <Link className="text-link" href="/admin/operations">
        Open store operations ↗
      </Link>
      <p className="fine-print">
        Staff: use <Link href="/account">your account and authenticator</Link>.
        Password access is a temporary, explicitly enabled bootstrap path.
      </p>
      <span className="eyebrow">{site.brand.wordmark} · STORE OPERATIONS</span>
      <h1 className="page-title">
        Behind the <em>store.</em>
      </h1>
      {!authenticated ? (
        <>
          <p className="admin-note">
            Restricted to the store operator. Administrator credentials must be
            configured securely before sign-in is available.
          </p>
          <form onSubmit={login} className="admin-form">
            <label>
              Administrator password
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                maxLength={200}
              />
            </label>
            <button className="button dark" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </>
      ) : (
        <>
          <div className="admin-toolbar">
            <div className="admin-tabs">
              <button
                className={`button ${tab === "products" ? "dark" : "outline"}`}
                onClick={() => setTab("products")}
              >
                Products
              </button>
              <button
                className={`button ${tab === "orders" ? "dark" : "outline"}`}
                onClick={() => setTab("orders")}
              >
                Orders
              </button>
            </div>
            <button
              className="text-button"
              onClick={async () => {
                try {
                  await api("/api/admin/logout", { method: "POST" });
                  window.dispatchEvent(new Event("account-changed"));
                  router.refresh();
                } catch {
                  setMessage("Sign-out failed. Please retry.");
                }
              }}
            >
              Sign out
            </button>
          </div>
          <p className="admin-note">
            Live checkout remains controlled by the deployment configuration.
            Enter prices as currency amounts; the server stores integer minor
            units. Fixed market prices do not imply currency conversion. Review
            fulfillment, taxes and policies before launch. Never mark an
            uncertain payment paid manually without independent verification.
          </p>
          {loading && <p role="status">Loading store data…</p>}
          {tab === "products" ? (
            <>
              <button className="button outline" onClick={seed} disabled={busy}>
                Import draft collection
              </button>
              <div className="admin-grid" style={{ marginTop: 25 }}>
                <ProductEditor
                  product={newProduct}
                  onSave={refresh}
                  report={setMessage}
                />
                {products.map((p) => (
                  <ProductEditor
                    key={p.sku}
                    product={p}
                    onSave={refresh}
                    report={setMessage}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="fine-print">
                Orders load in cursor-based pages. Use Operations for refunds,
                returns, payment recovery and audited review.
              </p>
              {!loading && !orders.length && (
                <div className="empty-state">
                  <h2>No orders yet.</h2>
                </div>
              )}
              {orders.map((o) => (
                <article className="admin-order" key={o._id}>
                  <h2>Order {o._id}</h2>
                  <p>
                    {new Date(o.createdAt).toLocaleString()} · {o.status} ·{" "}
                    {o.fulfillment} · {formatMoney(o.amountMinor, o.currency)}{" "}
                    before provider tax
                  </p>
                  <p>{o.items.map((i) => `${i.name} × ${i.qty}`).join(", ")}</p>
                  <p>
                    {o.address?.name} · {o.address?.email} · {o.address?.phone}
                    <br />
                    {[
                      o.address?.line1,
                      o.address?.line2,
                      o.address?.city,
                      o.address?.region,
                      o.address?.postalCode,
                      o.address?.country,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  {o.status === "paid" && o.fulfillment !== "delivered" && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        try {
                          await api("/api/admin/orders", {
                            method: "PATCH",
                            body: JSON.stringify({
                              orderId: o._id,
                              fulfillment: f.get("fulfillment"),
                              trackingNumber: f.get("trackingNumber"),
                            }),
                          });
                          await refresh();
                          setMessage("Fulfillment updated");
                        } catch (e) {
                          setMessage(
                            e instanceof Error ? e.message : "Update failed",
                          );
                        }
                      }}
                    >
                      <label>
                        <span className="sr-only">Next fulfillment state</span>
                        <select
                          name="fulfillment"
                          defaultValue={
                            {
                              unfulfilled: "processing",
                              processing: "shipped",
                              shipped: "delivered",
                            }[o.fulfillment]
                          }
                        >
                          <option value="processing">Processing</option>
                          <option value="shipped">Shipped</option>
                          <option value="delivered">Delivered</option>
                        </select>
                      </label>
                      <label>
                        <span className="sr-only">Tracking reference</span>
                        <input
                          name="trackingNumber"
                          defaultValue={o.trackingNumber}
                          placeholder="Tracking reference"
                          maxLength={160}
                        />
                      </label>
                      <button className="button dark">
                        Update fulfillment
                      </button>
                    </form>
                  )}
                </article>
              ))}
            </>
          )}
        </>
      )}
      {authenticated && (tab === "products" ? productCursor : orderCursor) && (
        <button className="button outline" disabled={busy} onClick={loadMore}>
          Load more {tab}
        </button>
      )}
      {message && (
        <div className="error-box" role="status">
          {message}
        </div>
      )}
    </main>
  );
}
function ProductEditor({
  product: p,
  onSave,
  report,
}: {
  product: ProductData;
  onSave: () => Promise<void>;
  report: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    let prices: Record<string, number>;
    try {
      prices = Object.fromEntries(
        site.currencies
          .filter((c) => String(f.get(c) ?? "").trim())
          .map((c) => [c, decimalToMinor(String(f.get(c)), c)]),
      );
    } catch {
      report("Enter valid currency amounts with the correct decimal precision");
      return;
    }
    const data = {
      sku: f.get("sku"),
      slug: f.get("slug"),
      name: f.get("name"),
      category: f.get("category"),
      tagline: f.get("tagline"),
      brand: String(f.get("brand") ?? ""),
      mpn: String(f.get("mpn") ?? ""),
      ...(f.get("gtin") ? { gtin: f.get("gtin") } : {}),
      condition: f.get("condition"),
      images: String(f.get("images") ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      ...(f.get("weightGrams")
        ? { weightGrams: Number(f.get("weightGrams")) }
        : {}),
      ...(f.get("taxCode") ? { taxCode: f.get("taxCode") } : {}),
      description: f.get("description"),
      parentSku: String(f.get("parentSku") ?? ""),
      attributes: String(f.get("attributes") ?? "")
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [name, ...value] = line.split(":");
          return { name: name.trim(), value: value.join(":").trim() };
        }),
      specifications: String(f.get("specifications") ?? "")
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [name, ...value] = line.split(":");
          return { name: name.trim(), value: value.join(":").trim() };
        }),
      prices,
      image: f.get("image"),
      features: String(f.get("features"))
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      stock: Number(f.get("stock")),
      active: f.get("active") === "on",
      featured: f.get("featured") === "on",
    };
    setBusy(true);
    try {
      await api("/api/admin/products", {
        method: "POST",
        body: JSON.stringify(data),
      });
      await onSave();
      report(
        "Product saved. Active products appear only when live commerce is enabled.",
      );
    } catch (e) {
      report(e instanceof Error ? e.message : "Could not save product");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="admin-product">
      <summary>
        {p.name || "+ Create a product"}
        {p.name &&
          ` · ${p.stock} available · ${p.active ? "Active" : "Inactive"}`}
      </summary>
      <form className="admin-form" onSubmit={save}>
        <label>
          SKU
          <input
            name="sku"
            required
            pattern="[a-z0-9-]{1,80}"
            defaultValue={p.sku}
            readOnly={!!p.sku}
          />
        </label>
        <label>
          URL slug
          <input
            name="slug"
            required
            pattern="[a-z0-9-]{1,100}"
            defaultValue={p.slug}
          />
        </label>
        <label>
          Product name
          <input name="name" required maxLength={120} defaultValue={p.name} />
        </label>
        <label>
          Category
          <select name="category" defaultValue={p.category}>
            {site.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Tagline
          <input name="tagline" maxLength={180} defaultValue={p.tagline} />
        </label>
        <label>
          Manufacturer / brand (optional)
          <input name="brand" defaultValue={p.brand ?? ""} maxLength={100} />
        </label>
        <label>
          GTIN barcode (optional)
          <input
            name="gtin"
            defaultValue={p.gtin ?? ""}
            pattern="[0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14}"
          />
        </label>
        <label>
          Manufacturer part number (optional)
          <input name="mpn" defaultValue={p.mpn ?? ""} maxLength={100} />
        </label>
        <label>
          Condition
          <select name="condition" defaultValue={p.condition ?? "new"}>
            <option value="new">New</option>
            <option value="refurbished">Refurbished</option>
            <option value="used">Used</option>
          </select>
        </label>
        <label>
          Description
          <textarea
            name="description"
            required
            minLength={10}
            maxLength={4000}
            defaultValue={p.description}
          />
        </label>
        <div className="form-grid">
          {site.currencies.map((c) => (
            <label key={c}>
              {c} price
              <input
                name={c}
                type="number"
                min={1}
                step={
                  c === "KES" || currencyDigits(c) === 0
                    ? 1
                    : 10 ** -currencyDigits(c)
                }
                defaultValue={minorToDecimal(p.prices[c], c)}
              />
            </label>
          ))}
        </div>
        <label>
          Initial stock (use inventory controls for existing products)
          <input
            name="stock"
            readOnly={!!p.sku}
            type="number"
            min={0}
            max={100000}
            step={1}
            required
            defaultValue={p.stock}
          />
        </label>
        <label>
          Product image (illustration name or /products/filename.jpg)
          <input name="image" defaultValue={p.image} required maxLength={200} />
          <small>
            Place approved photographs in public/products before setting their
            path.
          </small>
        </label>
        <label>
          Parent SKU (optional, for a variant)
          <input
            name="parentSku"
            defaultValue={p.parentSku ?? ""}
            maxLength={80}
          />
        </label>
        <label>
          Variant options (one Name: Value per line)
          <textarea
            name="attributes"
            defaultValue={
              p.attributes?.map((a) => `${a.name}: ${a.value}`).join("\n") ?? ""
            }
          />
        </label>
        <label>
          Specifications (one Name: Value per line)
          <textarea
            name="specifications"
            defaultValue={
              p.specifications
                ?.map((a) => `${a.name}: ${a.value}`)
                .join("\n") ?? ""
            }
          />
        </label>
        <label>
          Additional image paths (one per line)
          <textarea name="images" defaultValue={p.images?.join("\n") ?? ""} />
        </label>
        <label>
          Item weight (grams, optional)
          <input
            name="weightGrams"
            type="number"
            min={1}
            defaultValue={p.weightGrams ?? ""}
          />
        </label>
        <label>
          Stripe product tax code (optional; otherwise merchant default)
          <input
            name="taxCode"
            defaultValue={p.taxCode ?? ""}
            pattern="txcd_[0-9]{8}"
          />
        </label>
        <label>
          Features (one per line)
          <textarea name="features" defaultValue={p.features.join("\n")} />
        </label>
        <label>
          <span>
            <input name="active" type="checkbox" defaultChecked={p.active} />{" "}
            Active listing
          </span>
        </label>
        <label>
          <span>
            <input
              name="featured"
              type="checkbox"
              defaultChecked={p.featured}
            />{" "}
            Featured
          </span>
        </label>
        <button className="button dark" disabled={busy}>
          {busy ? "Saving…" : "Save product"}
        </button>
      </form>
    </details>
  );
}
