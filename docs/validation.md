# Validation record

Validation date: 2026-11-05. These are development-environment results, not production certification. Integration/load tests use disposable MongoDB replica sets and fake provider fixtures; no customer payment, refund or shipping label was initiated.

## Completed checks

- 15 unit checks: money/validation, deterministic discount allocation, currency decimals, GTIN checksums, session/authenticator cryptography, central configuration and release gates.
- 31 isolated HTTP/integration checks: transactional order/stock behavior, payment evidence/idempotency, email outbox, account one-time links and access boundaries, staff MFA/replay/roles/session revocation, variant catalog, warehouse transfers, promo capacity/redemption, refunds, return quantities/restocking, sanitized media, support/audit and pagination/search.
- Production build, strict TypeScript and formatting checks passed. Production dependency audit reported zero known vulnerabilities at validation time; this is not a security assessment.
- Three additional authenticated Chromium workflows passed: account rendering and guest-list separation, staff operational queues, decimal product-price entry and staff session revocation on sign-out.
- All 32 storefront checks passed across Chromium desktop/mobile, Firefox and WebKit. WebKit required signed Debian libraries installed in a workspace-only browser copy; its system-library-cache check was skipped because those local libraries are not in the host cache. The actual browser workflows ran successfully. Automated accessibility checks cover core shopper pages; manual assistive-technology review and authenticated admin accessibility acceptance remain necessary.
- Docker standalone image built locally and ran as UID 1000 (`node`). Storefront and preview health returned HTTP 200; Docker health became healthy. This does not validate production provider networking or database failover.

## Local browsing capacity

The [machine-readable report](validation/local-browsing-1000-vus.json) records 1,000 virtual shoppers, 1,000 synthetic products, a 20-second ramp and 30-second hold with 2–8-second think time. Traffic: 70% catalog API, 20% product pages, 6% home and 4% bag. The test warmed catalog routes and 30 product pages first.

Result: 8,548 requests in 50 seconds, zero errors, 171 requests/second, overall p95 9 ms/p99 17 ms; catalog p95 3 ms, document p95 15 ms. Peak requests in flight was 11. Test limits were <=1% errors and p95 <=2,000 ms per route group; both passed. Generator and server shared a 5-logical-CPU, 33-GiB host running Node 24.22.1.

This is a short, warm, read-only localhost workload. A virtual shopper is an active session with think time, not a continuously running concurrent HTTP request. It does not prove 1,000 simultaneous checkout writes, cold-cache capacity, production internet latency, sustained availability or payment-provider throughput. Repeat representative distributed workloads on the actual deployment before promising a client capacity/SLA.

## Actual configured services

A read-only M-Pesa OAuth request succeeded (HTTP 200 and token issued); no token was logged. End-to-end STK, shortcode/passkey, callback/query and settlement acceptance remain unverified.

The configured MongoDB connection failed hostname resolution (`ENOTFOUND`). The URI exists, but its hostname/SRV/DNS/network binding must be corrected before persistent deployment acceptance. No merchant database records were changed by this connectivity check.

Stripe, email, Shippo, FX and account-encryption bindings were absent in this environment when inspected. Provider-backed tests for those integrations remain outstanding. Secret values were not printed or committed.

`npm run check:production` correctly refuses release: public HTTPS origin, authenticator encryption, account email, approved policies/rates/tax, live card credentials/webhook and the enabled financial worker are incomplete. This expected negative result keeps the draft from being represented as live-ready.
