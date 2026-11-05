# Leron Urban Electronics

An international electronics storefront built with Next.js 16, React 19, TypeScript, MongoDB/Mongoose, Stripe Checkout and Safaricom Daraja.

**Current status: functional preview, not approved for live trading.** The owner requested a draft catalog. Products, illustrations, prices and legal pages are explicitly drafts; `COMMERCE_LIVE` defaults to false. Real provider credentials and merchant onboarding, approved commercial policies, and live integration acceptance are still required.

## Development

Use Node.js 22.12+ (validated on 24.22.1).

```sh
npm ci
# Copy .env.example to .env.local only if you do not already have local settings.
npm run dev
```

The preview works without a database or payment credentials. Browse `/`, `/products/[slug]`, `/cart` and `/checkout`. `/admin` exposes operator sign-in, not a public account-registration flow. Guest order access uses an HTTP-only browser cookie; order links do not grant access across browsers.

For database features, configure `MONGODB_URI` for a replica set or sharded cluster, `CHECKOUT_COOKIE_SECRET` (32+ random characters), and `APP_ORIGIN` matching the exact browser origin. Run `npm run db:prepare` against the intended database. It adds indexes and refuses unsupported MongoDB topology; it does not rewrite records or drop old indexes. Existing legacy orders require a deliberate migration and are not silently converted.

## Store administration

Set `ADMIN_SESSION_SECRET` to a separate random secret of at least 32 characters. Create `ADMIN_PASSWORD_HASH` with `node scripts/admin-password.mjs` by supplying a strong password on stdin through a password manager or secure local prompt. Do not put passwords in shell arguments or command history. The script outputs a salted scrypt hash, not the password. Store it securely in deployment settings. Sign in at `/admin`.

Product images can use built-in illustrations or approved local photographs placed in `public/products`; uploading files through the admin is not implemented.

The panel can import draft products (inactive, zero stock), create/edit listings and independent USD/KES prices, manage available inventory, review the most recent 100 orders, and advance paid orders through processing, shipped and delivered. Shipping requires a tracking reference. Customer accounts, an asset-upload service, automated returns/refunds, and multi-operator roles/MFA are not implemented; do not represent those capabilities as available. Use audited provider dashboards and the documented operator runbook for refunds and payment review. Production admin access should additionally be restricted by your hosting identity/access gateway with MFA.

## Payment architecture

All prices are integer minor units and loaded from MongoDB on the server; display currency is not exchange-rate conversion. Creating an order atomically reserves stock and records an idempotency key. Order creation rolls back all reservations if any item is unavailable. Reservations last 65 minutes. A scheduled job releases abandoned, unpaid orders, but never releases uncertain payment stock automatically.

Stripe hosts card entry and performs automatic tax calculation. The server verifies signed webhooks, order reference, currency and subtotal before confirming payment, and stores provider tax and total. M-Pesa is available only for KES orders delivered in Kenya with an explicitly approved tax configuration. Initiation claims and payment creation are transactional. Callback evidence is persisted before lookup to handle callbacks arriving before the initiation response. Reconciliation requires matching callback evidence and an independent STK query. An uncertain initiation is held for review to avoid duplicate charges. Neither provider confirmation nor this application is independent merchant settlement verification.

Configure the exact Stripe API version used by the installed SDK for webhook endpoints; replay signed events in staging before launch. Stripe Tax requires merchant registration/configuration; adding a key alone is insufficient. Merchant eligibility for Stripe depends on the operating entity and country. This application does not imply eligibility.

Paid-order receipts and fulfillment updates are recorded transactionally in a durable email outbox. Configure `RESEND_API_KEY` and a verified `EMAIL_FROM`, then run the scheduled reconciliation worker. Provider delivery is idempotent, retried with backoff, and held for review before its idempotency window expires. Real email delivery has not been exercised.

See [deployment and launch requirements](docs/production-readiness.md) for setup, security boundaries, provider endpoints, migrations and operational gaps.

## Verification

```sh
npm test                  # nine unit tests: money, validation, admin sessions, shipping
npm run typecheck -- --incremental false
npm run build
npm run test:integration  # isolated MongoDB replica set + HTTP tests; never your database
npm run test:e2e          # built server + Chromium desktop/mobile browser tests
npm run format:check
```

The integration runner downloads a checksum-verified MongoDB binary to its normal test cache. It starts a disposable local replica set and an app on port 3200, with disposable keys and no external payment requests. Browser tests run preview mode on port 3100 and require Chromium (`CHROMIUM_PATH`, system Chromium, or Playwright's installed browser). On a fresh machine run `npx playwright install --with-deps chromium` if needed. Build before integration or browser tests. Retained test screenshots and traces are ignored by Git.
