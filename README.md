# Leron Urban Electronics

Reusable electronics commerce application using Next.js 16, React 19, TypeScript, MongoDB transactions, Stripe Checkout and Safaricom Daraja. Leron's identity, support contacts, theme, navigation, enabled features, currency settings and policy text live in [one configuration file](src/config/site.ts). Brand and contact constants also populate policy copy.

**Release status: implemented application under validation, with a draft catalog and unapproved commercial policies. Live trading is disabled by default.** A successful build is not payment acceptance, a security certification or a guarantee of uninterrupted availability. See the [launch and operations guide](docs/production-readiness.md) and [validation record](docs/validation.md).

## Run locally

Use Node.js 22.12+; validation uses Node 24. Preview works without provider credentials or MongoDB.

```sh
npm ci
# Copy .env.example to .env.local only if local settings do not already exist.
npm run dev
```

For persistent features, provision a MongoDB replica set or sharded cluster, set deployment secrets using [.env.example](.env.example), then run `npm run db:prepare` against the intended database. This creates indexes and initial coordination/warehouse records; it does not drop indexes or silently migrate old orders. Back up an existing installation and review migration compatibility first.

## Included workflows

- Responsive storefront, filtered/paginated search, variants, image galleries and zoom, saved items, comparison, recent products, cart, currency selection, policies and contact/support forms.
- Email link accounts, address book, order history, data export, server-persisted signed-in wishlists, authenticator MFA and recovery codes.
- Server-priced checkout, transactional warehouse inventory reservations, promotion capacity, consent snapshots, idempotency, Stripe-hosted cards/tax and Kenya/KES M-Pesa.
- Signed payment events, durable callback evidence, conservative reconciliation and inventory release, receipts, fulfilment/tracking, verified-purchase review moderation, return requests and separately controlled restocking.
- Partial/full refunds, disputes and holds, two-person manual M-Pesa refund/recovery controls, durable email/tax/refund jobs, carrier rates/labels/tracking and sanitized GridFS/S3 media uploads.
- Role-controlled staff operations, authenticator verification, inventory adjustments/transfers, promotions, customer service, analytics, audit trail and private readiness diagnostics.
- Central theme variables, metadata, staged merchant feeds, structured product data, nonce-based CSP, static/runtime release checks, CI, a non-root Docker image and an isolated load harness.

These are application capabilities, not evidence that every provider is authorized or verified. [Architecture and boundaries](docs/architecture.md) describe the operational requirements and explicit limits. Preview products and illustrations are fixtures, not approved sale listings.

## Validate

```sh
npm test
npm run typecheck -- --incremental false
npm run build
npm run test:integration
npx playwright install --with-deps chromium firefox webkit
AUTH_BROWSER_TESTS=true npm run test:integration # adds staff/account UI checks
BROWSER_MATRIX=all npm run test:e2e
npm run test:load
npm run format:check
npm run check:production
```

Build before integration, browser and load tests. Integration and load runners create disposable MongoDB replica sets and download checksum-verified MongoDB binaries; they do not use the configured merchant database. Integration uses port 3200, browser tests 3100, load tests 3300. Run capacity tests separately from other heavy tasks. `check:production` deliberately reports unmet live requirements even when preview works.

## Reuse for another client

Edit `src/config/site.ts`: brand/contact constants, `site.id`, theme, currencies, launch countries and approved policies. Use a separate deployment, database, provider accounts, encryption/session secrets and media namespace for each client. Populate actual product and inventory records through administration. Configure commercial rates and credentials in deployment settings, never in the site file. See [customization](docs/customization.md).

## Deploy

The [Dockerfile](Dockerfile) builds a standalone non-root runtime. Run the web service and a separate supervised worker (`npm run worker`, or `node scripts/worker.mjs` inside the image). Configure secrets at runtime, keep preview enabled until release acceptance, and serve through HTTPS with database backups and monitoring. No deployment or environment publication is performed by this repository's build.
