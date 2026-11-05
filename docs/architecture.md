# Architecture and operating boundaries

## Data and transactions

Next.js renders the storefront and serves same-origin APIs; MongoDB is the source of truth. A replica set or sharded topology is mandatory. Checkout reloads active SKU prices and reserves warehouse stock and promotion capacity in one transaction. Client totals, browser storage and return URLs cannot mark an order paid. Stable request keys and payload hashes protect retries; authoritative stock changes use transaction guards and immutable movement records.

Catalog reads are bounded, cached and paginated with MongoDB indexes/full-text search. Cache keys include a non-reversible deployment/database/configuration digest. Prices and stock are rechecked at order creation. Catalog pages can briefly show cached availability. Admin order/product lists use cursors; operational queues use bounded batches. MongoDB text search is adequate for the tested catalog; typo tolerance, semantic/vector discovery and a dedicated search service are not implemented.

## Identity and authorization

Guest orders are accessible through an HTTP-only browser cookie. A verified email account links prior guest orders for that email and supports cross-device order access, addresses and export. Email links are hashed, short-lived and consumed by POST, so email-scanner GETs do not sign a customer in. Staff use the same verified account with encrypted authenticator secrets and server-enforced roles. MFA verification is required for staff access and must be fresh for sensitive operations. Role changes revoke sessions and cannot remove the last owner.

Guest saved items remain browser-local. Signed-in wishlists use the account's server list; guest lists are not silently imported into a different account. Comparison/recent products remain browser-local. These essential storage mechanisms do not authorize marketing tracking. Account deletion/retention requests need operator review; self-service automated deletion, SSO/passkeys and authenticator rotation are not implemented.

## Payments and jobs

Stripe hosts card entry; signed events validate order, currency and totals. M-Pesa initiation and callback evidence are persisted with cautious recovery of uncertain outcomes. No screenshot or operator toggle can assert payment success. Promo discounts are allocated exactly in minor units. Refund reservations cannot exceed the paid balance; physical return restocking is a separate action. Card dispute events hold fulfilment. Representment/evidence submission and chargeback arbitration remain provider-dashboard processes.

Durable MongoDB outboxes/jobs cover email, refunds and tax postings. The supervised HTTP worker calls `/api/internal/reconcile` in bounded batches with a bearer secret. Multiple workers may operate safely through leases/idempotency, but provider throughput and backlog clearance must be sized for the deployment. Failure and uncertain provider outcomes can require human review. This is not an exactly-once external delivery guarantee: provider idempotency windows expire. Pending Stripe refunds depend on signed provider events; investigate/replay delayed events rather than blindly issuing a second refund.

Receipts and notification emails are transactional. Resend sender authorization and delivery/bounce monitoring require live acceptance. Shippo mutating calls disable SDK retries; ambiguous label purchases enter review to avoid paying twice. International labels require a pre-approved customs declaration. Stripe Tax is optional for M-Pesa; flat tax remains a separately approved alternative. Partial-refund tax adjustments can require operator review. Neither integration files tax returns or determines merchant tax obligations.

## Media, deployment and observability

Uploads accept bounded raster images, limit decoded pixels, strip metadata and re-encode WebP. GridFS is the default; S3-compatible storage is optional. Do not store secrets or private documents as product media: assets are publicly accessible. Use object/database backups and lifecycle policies.

The Docker runtime is non-root and uses Next standalone output. Deploy independent web and supervised worker services behind HTTPS. HTTP health checks verify preview/database liveness; private readiness adds topology, enrolled-owner, worker-heartbeat and queue diagnostics. Static release checks do not prove provider authorization. Add hosted logs, metrics, paging, edge abuse protection, point-in-time backups and restore drills. No production infrastructure, DNS, CDN/WAF, alerts or schedules are provisioned by this source tree.

## Scope and handoff

Included flows are described in README and validated to the extent recorded in `validation.md`. Not implemented: marketplace sellers, subscriptions, loyalty points, gift cards, abandoned-cart marketing/consent automation, multilingual translation management, ERP/accounting settlement reconciliation, fraud scoring, a recommendation engine, subscription billing, a native mobile application or multi-tenant SaaS management. Adding every feature sold by every commerce platform would require separate product decisions and acceptance criteria.

No source repository can promise it will never fail or meet every specification of Google or Amazon. Merchant feeds and structured data require actual approved products and platform account review. PCI obligations, accessibility conformance, privacy law, consumer terms, tax compliance and an external security assessment remain merchant/deployment responsibilities. Use explicit release criteria and measured capacity instead of asserting certification.
