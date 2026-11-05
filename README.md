# M-Pesa checkout reference (Next.js 16)

## Setup
1. `npm install`
2. Copy `.env.example` to `.env.local`; set all secrets. Never commit `.env.local`.
3. Use a MongoDB Atlas replica set (transactions required).
4. Set `APP_ORIGIN` to the exact browser origin (including scheme and port). Local: `http://localhost:3000`.
5. Set `MPESA_CALLBACK_URL` to a publicly accessible HTTPS endpoint with URL-encoded `token` matching `MPESA_CALLBACK_TOKEN`. A tunnel is needed for local callback testing.
6. `npm run dev`; open `/checkout`.
7. For cron, configure `CRON_SECRET` and deployment scheduling appropriate to your hosting plan. Vercel's cron schedule limits vary by plan; adjust `vercel.json` accordingly.

## Important integration and production gaps
- **Demo catalog:** Replace `src/lib/catalog.ts` with your authoritative product database and stock reservation, tax/shipping calculations. Do not use the example SKU prices for real orders.
- **Guest session:** Guest checkout cookie identifies an order, but is not a substitute for your account auth if your store uses accounts. Add CSRF protection for state-changing endpoints if allowing cross-site usage.
- **STK initiation uncertainty:** On any initiation failure, this implementation holds the order for review rather than risking a duplicate charge. A dedicated recovery workflow is required to release it after verification.
- **Callback timing race:** A callback arriving before the STK initiation response is persisted may be unmatched; implement a durable unmatched-callback queue or matching process for high volume. Safaricom may retry callbacks, but do not assume it will.
- **Settlement:** A matching STK Query and callback indicate checkout success, not independent settlement confirmation. Reconcile receipts against merchant statements before irreversible fulfillment.
- **Manual review:** Build a protected admin interface to verify `review` transactions and resolve orders. Do not auto-refund/retry based only on client requests.
- **Security:** Rotate any secrets previously shared in logs or chats. Add request throttling, fraud monitoring, alerts, observability, and retention/privacy policy.
- **Availability:** Query API can temporarily return HTTP 500; retry then review rather than treating that as a failed payment.
- **Status/cron:** Polling reads DB only; cron performs reconciliation. Set cron frequency appropriate to platform limits.
- **Transactions:** Requires replica-set MongoDB. Test simultaneous payments, callback duplicates, callback before STK response, timeouts, and deployment restarts.
- **Mongoose schema compatibility:** This project defines its own models; do not paste into an existing store without adapting its schema and order lifecycle.
- **Idempotency:** The atomic `activePaymentId` claim prevents duplicate payment requests for a single order. A production implementation should also implement request-level idempotency keys and persistent STK initiation/outbox handling.
- **Operational note:** This is a complete runnable reference, **not** a production certification or guarantee of settlement correctness.
