"use client";
import { roleAllows } from "@/lib/permissions";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { operationKey } from "@/lib/client-idempotency";
import { site, storageKey } from "@/config/site";
import { clientAPI } from "./account-panel";
import { decimalToMinor } from "@/lib/money";
import { formatMoney } from "@/lib/catalog";
type Row = Record<string, any>;
const sections = [
  { key: "analytics", label: "Overview" },
  { key: "readiness", label: "Launch checks" },
  { key: "payments", label: "Payment recovery" },
  { key: "email", label: "Email queue" },
  { key: "tax-jobs", label: "Tax jobs" },
  { key: "inventory", label: "Inventory" },
  { key: "coupons", label: "Promotions" },
  { key: "returns", label: "Returns" },
  { key: "refunds", label: "Refunds" },
  { key: "shipments", label: "Shipping" },
  { key: "media", label: "Media" },
  { key: "reviews", label: "Reviews" },
  { key: "support", label: "Support" },
  { key: "staff", label: "Staff" },
  { key: "audit", label: "Audit" },
];
export function OperationsPanel({ role }: { role: string }) {
  const required: Record<string, string> = {
    analytics: "analytics.read",
    readiness: "audit.read",
    payments: "refunds.write",
    email: "audit.read",
    "tax-jobs": "refunds.write",
    inventory: "inventory.write",
    coupons: "promotions.write",
    returns: "returns.manage",
    refunds: "refunds.write",
    shipments: "orders.fulfill",
    media: "media.write",
    reviews: "reviews.moderate",
    support: "support.manage",
    staff: "staff.manage",
    audit: "audit.read",
  };
  const allowed = sections.filter((s) => roleAllows(role, required[s.key]));
  const [section, setSection] = useState(allowed[0]?.key ?? "inventory"),
    [data, setData] = useState<{
      [key: string]: any;
      items?: Row[];
      warehouses?: Row[];
      balances?: Row[];
      movements?: Row[];
      nextCursor?: string;
    }>({}),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  async function load(cursor?: string) {
    setLoading(true);
    try {
      const result = await clientAPI(
        `/api/admin/${section}${cursor ? `?cursor=${cursor}` : ""}`,
      );
      setData((old) =>
        cursor
          ? {
              ...result,
              items: [...(old.items ?? []), ...(result.items ?? [])],
            }
          : result,
      );
    } catch (e) {
      setData({});
      setMessage(e instanceof Error ? e.message : "Operations unavailable");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    setMessage("");
    void load();
  }, [section]);
  async function perform(
    path: string,
    body: Record<string, unknown>,
    method = "POST",
    idempotent = false,
  ) {
    setBusy(true);
    setMessage("");
    try {
      const requestId = idempotent ? await operationKey(path, body) : undefined;
      const result = await clientAPI(path, {
        method,
        body: JSON.stringify({ ...body, ...(requestId ? { requestId } : {}) }),
      });
      if (idempotent)
        try {
          sessionStorage.removeItem(storageKey(`operation:${path}`));
        } catch {}
      await load();
      setMessage(result.message ?? "Operation recorded successfully");
      return result;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Operation failed");
      return null;
    } finally {
      setBusy(false);
    }
  }
  function fields(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    return new FormData(e.currentTarget);
  }
  const rows = data.items ?? [];
  return (
    <main id="main" className="shell section">
      <span className="eyebrow">{site.brand.wordmark} · OPERATIONS</span>
      <h1 className="page-title">
        Run the <em>everyday.</em>
      </h1>
      <div className="admin-toolbar">
        <Link href="/admin" className="text-link">
          ← Products & orders
        </Link>
        <button
          className="button outline"
          disabled={loading}
          onClick={() => load()}
        >
          Refresh
        </button>
      </div>
      <nav className="account-tabs" aria-label="Store operations">
        {allowed.map((s) => (
          <button
            key={s.key}
            className={`button ${section === s.key ? "dark" : "outline"}`}
            onClick={() => setSection(s.key)}
          >
            {s.label}
          </button>
        ))}
      </nav>
      {loading && <p role="status">Loading operations…</p>}
      {message && (
        <div className="feedback-box" role="status">
          {message}
        </div>
      )}

      {section === "readiness" && (
        <section>
          <h2>Release checks</h2>
          <p>
            {data.configurationPassed
              ? "Static and runtime checks passed"
              : "Release prerequisites remain incomplete"}
          </p>
          <ul>
            {data.issues?.map((i: string) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
          <p>{data.providerAcceptance}</p>
          <p>Worker last run: {data.workerLastRunAt ?? "Not observed"}</p>
        </section>
      )}
      {section === "analytics" && (
        <section>
          <h2>Last 30 days</h2>
          <DataTable
            rows={data.revenueByCurrency ?? []}
            columns={[
              "_id",
              "orders",
              "grossPaidMinor",
              "refundsMinor",
              "pendingRefundMinor",
            ]}
          />
          <p>{data.note}</p>
          <p>
            Open returns: {data.queues?.returns ?? 0} · Reviews:{" "}
            {data.queues?.reviews ?? 0} · Tickets: {data.queues?.tickets ?? 0}
          </p>
        </section>
      )}
      {section === "email" && (
        <>
          <p className="fine-print">
            Message bodies, sign-in tokens and recipient details are
            intentionally excluded. Old or uncertain jobs require provider
            verification, not blind resend.
          </p>
          {rows.map((r) => (
            <article className="admin-order" key={r._id}>
              <h2>{r.eventKey}</h2>
              <p>
                {r.status} · Attempts {r.attempts}
              </p>
              {r.status === "review" && (
                <form
                  className="admin-form"
                  onSubmit={(e) => {
                    const f = fields(e);
                    void perform(
                      "/api/admin/email",
                      { id: r._id, note: f.get("note") },
                      "PATCH",
                    );
                  }}
                >
                  <Input
                    name="note"
                    label="Investigation and audit note"
                    required
                    minLength={10}
                  />
                  <button className="button outline" disabled={busy}>
                    Request retry within safe window
                  </button>
                </form>
              )}
            </article>
          ))}
        </>
      )}
      {section === "tax-jobs" && (
        <>
          <p className="fine-print">
            Partial non-card refund tax allocations require review against the
            actual returned tax line items. Never treat an operational refund
            total as a tax filing.
          </p>
          <DataTable
            rows={rows}
            columns={["_id", "orderId", "kind", "status", "providerId", "note"]}
          />
        </>
      )}
      {section === "payments" && (
        <>
          <p className="fine-print">
            A no-charge release requires independent provider/statement
            verification by two different named finance operators. Rechecking
            never bypasses provider evidence matching.
          </p>
          {rows.map((r) => (
            <article className="admin-order" key={r._id}>
              <h2>Payment {r._id}</h2>
              <p>
                Order {r.orderId} · {r.status} · KES {r.amount}
              </p>
              <p>{r.resultDescription}</p>
              {r.status === "review" && (
                <form
                  className="admin-form"
                  onSubmit={(e) => {
                    const f = fields(e);
                    void perform("/api/admin/payments", {
                      paymentId: r._id,
                      action: f.get("action"),
                      note: f.get("note"),
                      ...(f.get("proofReference")
                        ? { proofReference: f.get("proofReference") }
                        : {}),
                      ...(f.get("recoveryId")
                        ? { recoveryId: f.get("recoveryId") }
                        : {}),
                    });
                  }}
                >
                  <label>
                    Recovery action
                    <select name="action">
                      <option value="recheck">
                        Recheck matched provider evidence
                      </option>
                      <option value="request_release">
                        Request no-charge release review
                      </option>
                      <option value="confirm_release">
                        Independently confirm release review
                      </option>
                    </select>
                  </label>
                  <Input
                    name="proofReference"
                    label="Verified provider/statement reference (release request)"
                  />
                  <Input
                    name="recoveryId"
                    label="Recovery review ID (second operator)"
                  />
                  <label>
                    Audit note
                    <textarea name="note" minLength={10} required />
                  </label>
                  <button className="button outline" disabled={busy}>
                    Record recovery action
                  </button>
                </form>
              )}
            </article>
          ))}
          <DataTable
            rows={data.recoveries ?? []}
            columns={[
              "_id",
              "paymentId",
              "requestedBy",
              "proofReference",
              "status",
            ]}
          />
        </>
      )}
      {section === "inventory" && (
        <>
          <div className="account-layout">
            <form
              className="admin-form"
              onSubmit={(e) => {
                const f = fields(e);
                void perform(
                  "/api/admin/inventory",
                  {
                    sku: f.get("sku"),
                    warehouse: f.get("warehouse"),
                    ...(f.get("destination")
                      ? { destination: f.get("destination") }
                      : {}),
                    quantity: Number(f.get("quantity")),
                    reason: f.get("reason"),
                  },
                  "POST",
                  true,
                );
              }}
            >
              <h2>Adjust or transfer stock</h2>
              <Input name="sku" label="Product SKU" required />
              <label>
                Source warehouse
                <select name="warehouse">
                  {data.warehouses?.map((w) => (
                    <option value={w._id} key={w._id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Destination (transfers only)
                <select name="destination">
                  <option value="">Stock adjustment, not a transfer</option>
                  {data.warehouses?.map((w) => (
                    <option value={w._id} key={w._id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                name="quantity"
                label="Quantity (+ to add, − to remove; transfers use positive values)"
                type="number"
                required
              />
              <label>
                Audit reason
                <textarea
                  name="reason"
                  required
                  minLength={5}
                  maxLength={300}
                />
              </label>
              <button className="button dark" disabled={busy}>
                Record stock movement
              </button>
            </form>
            <form
              className="admin-form"
              onSubmit={(e) => {
                const f = fields(e);
                void perform("/api/admin/warehouses", {
                  id: f.get("id"),
                  name: f.get("name"),
                });
              }}
            >
              <h2>Add a warehouse</h2>
              <Input name="id" label="Warehouse code" required />
              <Input name="name" label="Display name" required />
              <button className="button outline" disabled={busy}>
                Save warehouse
              </button>
              <p className="fine-print">
                Stock adjustments affect available quantities only. Reservations
                and movement history remain intact. Sender addresses must be
                verified before carrier quoting.
              </p>
            </form>
          </div>
          <h2 className="subsection">Available stock</h2>
          <DataTable
            rows={data.balances ?? []}
            columns={["sku", "warehouse", "available"]}
          />
          <h2>Movement history</h2>
          <DataTable
            rows={data.movements ?? []}
            columns={["sku", "kind", "quantity", "actor", "createdAt"]}
          />
        </>
      )}
      {section === "coupons" && (
        <>
          <form
            className="admin-form"
            onSubmit={(e) => {
              const f = fields(e),
                currency = String(f.get("currency"));
              try {
                void perform("/api/admin/coupons", {
                  code: f.get("code"),
                  kind: f.get("kind"),
                  value: decimalToMinor(
                    String(f.get("value")),
                    f.get("kind") === "percent" ? "USD" : currency,
                  ),
                  currency,
                  minimumSubtotal: decimalToMinor(
                    String(f.get("minimumSubtotal") || "0"),
                    currency,
                  ),
                  maxUses: Number(f.get("maxUses")),
                  requireAccount: f.get("requireAccount") === "on",
                  active: true,
                  startsAt: new Date(String(f.get("startsAt"))).toISOString(),
                  endsAt: new Date(String(f.get("endsAt"))).toISOString(),
                });
              } catch (e) {
                setMessage(
                  e instanceof Error ? e.message : "Invalid promotion",
                );
              }
            }}
          >
            <h2>Create or update a promotion</h2>
            <Input name="code" label="Promotion code" required />
            <label>
              Discount type
              <select name="kind">
                <option value="percent">Percentage</option>
                <option value="fixed">Fixed amount</option>
              </select>
            </label>
            <Input
              name="value"
              label="Discount (percentage points or currency amount)"
              required
              type="number"
              step="0.01"
            />
            <label>
              Currency
              <select name="currency">
                {site.currencies.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <Input
              name="minimumSubtotal"
              label="Minimum merchandise total"
              defaultValue="0"
              type="number"
              step="0.01"
            />
            <Input
              name="maxUses"
              label="Maximum total redemptions"
              type="number"
              min="1"
              required
            />
            <Input
              name="startsAt"
              label="Starts at (your local time)"
              type="datetime-local"
              required
            />
            <Input
              name="endsAt"
              label="Ends at (your local time)"
              type="datetime-local"
              required
            />
            <label>
              <input name="requireAccount" type="checkbox" defaultChecked /> One
              use per verified account
            </label>
            <button className="button dark" disabled={busy}>
              Save promotion
            </button>
          </form>
          <DataTable
            rows={rows}
            columns={[
              "code",
              "kind",
              "value",
              "currency",
              "usedUses",
              "reservedUses",
              "maxUses",
              "active",
              "endsAt",
            ]}
          />
        </>
      )}
      {section === "returns" &&
        rows.map((r) => (
          <article className="admin-order" key={r._id}>
            <h2>Return {r._id}</h2>
            <p>
              Order {r.orderId} · {r.status} ·{" "}
              {r.restocked ? "Restocked" : "Not restocked"}
            </p>
            <p>{r.reason}</p>
            <p>{r.items?.map((i: Row) => `${i.sku} × ${i.qty}`).join(", ")}</p>
            <form
              className="admin-form"
              onSubmit={(e) => {
                const f = fields(e);
                void perform(
                  "/api/admin/returns",
                  {
                    id: r._id,
                    action: f.get("action"),
                    note: f.get("note"),
                    warehouse: String(f.get("warehouse") || "default"),
                  },
                  "PATCH",
                );
              }}
            >
              <label>
                Action
                <select name="action">
                  <option value="approve">Approve requested return</option>
                  <option value="reject">Reject requested return</option>
                  <option value="in_transit">Mark in transit</option>
                  <option value="receive">Confirm physical receipt</option>
                  <option value="restock">Restock received items</option>
                  <option value="close">Close received return</option>
                </select>
              </label>
              <Input
                name="warehouse"
                label="Restock warehouse code"
                defaultValue="default"
              />
              <label>
                Audit note
                <textarea name="note" required minLength={5} maxLength={2000} />
              </label>
              <button className="button dark" disabled={busy}>
                Update return
              </button>
            </form>
          </article>
        ))}
      {section === "refunds" && (
        <>
          <RefundForm perform={perform} busy={busy} />
          {rows.map((r) => (
            <article className="admin-order" key={r._id}>
              <h2>
                {formatMoney(r.amountMinor, r.currency)} · {r.status}
              </h2>
              <p>
                Refund {r._id} · Order {r.orderId}
              </p>
              <p>{r.reason}</p>
              <p className="fine-print">
                Refunds do not restock inventory. Confirm physical returns
                separately.
              </p>
              {r.status === "awaiting_manual" && (
                <form
                  className="admin-form"
                  onSubmit={(e) => {
                    const f = fields(e);
                    void perform(
                      "/api/admin/refunds",
                      {
                        id: r._id,
                        providerReference: f.get("providerReference"),
                      },
                      "PATCH",
                    );
                  }}
                >
                  <Input
                    name="providerReference"
                    label="Independently verified provider refund reference"
                    required
                  />
                  <p className="fine-print">
                    A different named finance operator must confirm manual
                    refunds after verifying the actual provider transaction.
                  </p>
                  <button className="button outline" disabled={busy}>
                    Confirm external refund
                  </button>
                </form>
              )}
            </article>
          ))}
        </>
      )}
      {section === "shipments" && (
        <>
          <ShippingForm perform={perform} busy={busy} />
          {rows.map((r) => (
            <article className="admin-order" key={r._id}>
              <h2>
                Order {r.orderId} · {r.warehouse}
              </h2>
              <p>
                {r.status} · {r.deliveryStatus ?? "Awaiting tracking"}
              </p>
              {r.trackingNumber && <p>Tracking: {r.trackingNumber}</p>}
              {r.labelUrl && (
                <a
                  className="text-link"
                  href={r.labelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open carrier label ↗
                </a>
              )}
              {r.status === "quoted" && (
                <form
                  className="admin-form"
                  onSubmit={(e) => {
                    const f = fields(e);
                    void perform(
                      "/api/admin/shipments",
                      {
                        id: r._id,
                        rateId: f.get("rateId"),
                        trackingCarrier: f.get("trackingCarrier"),
                      },
                      "PATCH",
                    );
                  }}
                >
                  <label>
                    Carrier rate
                    <select name="rateId">
                      {r.rates?.map((rate: Row) => (
                        <option key={rate.id} value={rate.id}>
                          {rate.provider} · {rate.service} · {rate.currency}{" "}
                          {rate.amount}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Input
                    name="trackingCarrier"
                    label="Shippo tracking carrier code (verify with carrier configuration)"
                    required
                  />
                  <label>
                    <input type="checkbox" required /> I approve this paid
                    carrier-label purchase.
                  </label>
                  <button className="button dark" disabled={busy}>
                    Purchase carrier label
                  </button>
                </form>
              )}
              {r.status === "review" && (
                <p className="error-text">
                  Verify the provider dashboard before any replacement label
                  purchase.
                </p>
              )}
            </article>
          ))}
        </>
      )}
      {section === "media" && (
        <>
          <form
            className="admin-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const file = new FormData(e.currentTarget).get("image") as File;
              if (!file?.size) return;
              setBusy(true);
              try {
                const r = await fetch("/api/admin/media", {
                    method: "POST",
                    headers: { "content-type": file.type },
                    body: file,
                  }),
                  data = await r.json();
                if (!r.ok) throw new Error(data.error);
                setMessage(`Image uploaded: ${data.url}`);
                await load();
              } catch (e) {
                setMessage(e instanceof Error ? e.message : "Upload failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>Upload a product photograph</h2>
            <label>
              Image (JPEG, PNG, WebP or AVIF, up to 8 MB)
              <input
                name="image"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                required
              />
            </label>
            <p className="fine-print">
              Images are decoded, resized, stripped of metadata and converted to
              WebP. Files persist in configured object storage or MongoDB
              GridFS.
            </p>
            <button className="button dark" disabled={busy}>
              Upload image
            </button>
          </form>
          <div className="media-grid">
            {rows.map((m) => (
              <article className="address-card" key={m.id}>
                <Image
                  src={m.url}
                  alt="Uploaded product asset"
                  width={220}
                  height={220}
                />
                <p>
                  {m.width} × {m.height}
                </p>
                <button
                  className="button outline"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(m.url)
                      .then(() => setMessage("Product image path copied"));
                  }}
                >
                  Copy image path
                </button>
              </article>
            ))}
          </div>
        </>
      )}
      {section === "reviews" &&
        rows.map((r) => (
          <article className="admin-order" key={r._id}>
            <h2>{r.title}</h2>
            <p>
              {r.sku} · {r.rating}/5 · Verified purchase
            </p>
            <p>{r.body}</p>
            <div className="account-tabs">
              <button
                className="button dark"
                disabled={busy}
                onClick={() =>
                  perform(
                    "/api/admin/reviews",
                    { id: r._id, status: "approved" },
                    "PATCH",
                  )
                }
              >
                Publish review
              </button>
              <button
                className="button outline"
                disabled={busy}
                onClick={() =>
                  perform(
                    "/api/admin/reviews",
                    { id: r._id, status: "rejected" },
                    "PATCH",
                  )
                }
              >
                Reject review
              </button>
            </div>
          </article>
        ))}
      {section === "support" &&
        rows.map((t) => (
          <article className="admin-order" key={t._id}>
            <h2>{t.subject}</h2>
            <p>
              {t.name} · {t.email} · {t.status}
            </p>
            {t.messages?.map((m: Row, i: number) => (
              <blockquote key={i}>
                <strong>{m.from}</strong>
                <p>{m.body}</p>
              </blockquote>
            ))}
            <form
              className="admin-form"
              onSubmit={(e) => {
                const f = fields(e);
                void perform(
                  "/api/admin/support",
                  { id: t._id, status: f.get("status"), reply: f.get("reply") },
                  "PATCH",
                  true,
                );
              }}
            >
              <label>
                Reply
                <textarea name="reply" required maxLength={5000} />
              </label>
              <label>
                Status
                <select name="status">
                  <option value="pending">Waiting for customer</option>
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                </select>
              </label>
              <button className="button dark" disabled={busy}>
                Queue reply & update ticket
              </button>
            </form>
          </article>
        ))}
      {section === "staff" && (
        <>
          <form
            className="admin-form"
            onSubmit={(e) => {
              const f = fields(e);
              void perform(
                "/api/admin/staff",
                {
                  email: f.get("email"),
                  role: f.get("role"),
                  disabled: f.get("disabled") === "on",
                },
                "PATCH",
              );
            }}
          >
            <h2>Manage staff access</h2>
            <p className="fine-print">
              The person must verify their email first. Role changes revoke
              existing sessions. Staff must enroll and verify an authenticator
              to access operations.
            </p>
            <Input
              name="email"
              label="Verified account email"
              type="email"
              required
            />
            <label>
              Role
              <select name="role">
                {[
                  "customer",
                  "owner",
                  "manager",
                  "support",
                  "warehouse",
                  "finance",
                ].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label>
              <input name="disabled" type="checkbox" /> Disable account
            </label>
            <button className="button dark" disabled={busy}>
              Update role & revoke sessions
            </button>
          </form>
          <DataTable
            rows={rows}
            columns={["name", "email", "role", "disabled", "verifiedAt"]}
          />
        </>
      )}
      {section === "audit" && (
        <DataTable
          rows={rows}
          columns={["createdAt", "actor", "action", "resource", "details"]}
        />
      )}
      {data.nextCursor && (
        <button
          className="button outline"
          disabled={loading}
          onClick={() => load(data.nextCursor)}
        >
          Load more records
        </button>
      )}
    </main>
  );
}
function Input({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label>
      {label}
      <input {...props} />
    </label>
  );
}
function DataTable({ rows, columns }: { rows: Row[]; columns: string[] }) {
  return (
    <div className="comparison-scroll">
      <table className="comparison-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col">
                {c.replace(/([A-Z])/g, " $1")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r._id ?? i}>
              {columns.map((c) => (
                <td key={c}>
                  {typeof r[c] === "object"
                    ? JSON.stringify(r[c])
                    : String(r[c] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p>No matching records.</p>}
    </div>
  );
}
function RefundForm({
  perform,
  busy,
}: {
  perform: (
    path: string,
    body: Row,
    method?: string,
    idempotent?: boolean,
  ) => Promise<any>;
  busy: boolean;
}) {
  const form = useRef<HTMLFormElement>(null),
    [order, setOrder] = useState<Row | null>(null),
    [error, setError] = useState("");
  return (
    <form
      ref={form}
      className="admin-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        try {
          if (!order || order._id !== f.get("orderId"))
            throw new Error("Load the order before requesting a refund");
          void perform(
            "/api/admin/refunds",
            {
              orderId: order._id,
              amountMinor: decimalToMinor(
                String(f.get("amount")),
                order.currency,
              ),
              reason: f.get("reason"),
            },
            "POST",
            true,
          );
        } catch (e) {
          setError(e instanceof Error ? e.message : "Invalid amount");
        }
      }}
    >
      <h2>Request a partial or full refund</h2>
      <Input name="orderId" label="Order reference" required />
      <button
        type="button"
        className="button outline"
        onClick={async () => {
          try {
            const id = String(new FormData(form.current!).get("orderId"));
            const data = await clientAPI(
              `/api/admin/orders?orderId=${encodeURIComponent(id)}`,
            );
            const record = (data.items ?? data)[0];
            if (!record) throw new Error("Order not found");
            setOrder(record);
            setError("");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Order unavailable");
          }
        }}
      >
        Load paid amount
      </button>
      {order && (
        <p>
          Paid:{" "}
          {formatMoney(
            order.totalPaidMinor ?? order.amountMinor,
            order.currency,
          )}{" "}
          · Refunded: {formatMoney(order.refundedMinor ?? 0, order.currency)} ·
          Pending: {formatMoney(order.refundReservedMinor ?? 0, order.currency)}
        </p>
      )}
      <Input
        name="amount"
        label={`Refund amount (${order?.currency ?? "load order first"})`}
        type="number"
        step="0.01"
        required
      />
      <label>
        Reason
        <textarea name="reason" minLength={10} maxLength={1000} required />
      </label>
      <label>
        <input type="checkbox" required /> I verified the order and authorize
        this refund request.
      </label>
      <button className="button dark" disabled={busy || !order}>
        Reserve refund for processing
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
function ShippingForm({
  perform,
  busy,
}: {
  perform: (
    path: string,
    body: Row,
    method?: string,
    idempotent?: boolean,
  ) => Promise<any>;
  busy: boolean;
}) {
  return (
    <form
      className="admin-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void perform("/api/admin/shipments", {
          orderId: f.get("orderId"),
          warehouse: f.get("warehouse"),
          parcels: [
            {
              length: Number(f.get("length")),
              width: Number(f.get("width")),
              height: Number(f.get("height")),
              weightGrams: Number(f.get("weight")),
            },
          ],
          ...(f.get("customs")
            ? { customsDeclarationId: f.get("customs") }
            : {}),
        });
      }}
    >
      <h2>Get a carrier quote</h2>
      <Input name="orderId" label="Paid order reference" required />
      <Input
        name="warehouse"
        label="Allocated warehouse code"
        defaultValue="default"
        required
      />
      <div className="form-grid">
        <Input
          name="length"
          label="Length (cm)"
          type="number"
          min="1"
          step="0.1"
          required
        />
        <Input
          name="width"
          label="Width (cm)"
          type="number"
          min="1"
          step="0.1"
          required
        />
        <Input
          name="height"
          label="Height (cm)"
          type="number"
          min="1"
          step="0.1"
          required
        />
        <Input
          name="weight"
          label="Packed weight (grams)"
          type="number"
          min="1"
          required
        />
      </div>
      <Input
        name="customs"
        label="Approved customs declaration ID (international shipments)"
      />
      <button className="button outline" disabled={busy}>
        Request carrier rates
      </button>
      <p className="fine-print">
        Quoting does not purchase a label or mark an order shipped. Sender
        addresses, customs data and carrier accounts must be configured and
        verified.
      </p>
    </form>
  );
}
