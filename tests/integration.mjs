import assert from "node:assert/strict";
import { randomBytes, createHmac, scryptSync } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import Stripe from "stripe";
import { prepareIndexes } from "../scripts/prepare-db.mjs";

// Every credential and database below is disposable. No user database or remote payment API is used.
const origin = "http://127.0.0.1:3200",
  cookieSecret = randomBytes(32).toString("hex"),
  adminSecret = randomBytes(32).toString("hex"),
  adminPassword = randomBytes(20).toString("hex"),
  salt = randomBytes(16).toString("hex"),
  adminHash = salt + ":" + scryptSync(adminPassword, salt, 64).toString("hex"),
  webhookSecret = "whsec_disposable_integration_fixture",
  cronSecret = randomBytes(32).toString("hex"),
  callbackToken = randomBytes(32).toString("hex");
let replica,
  server,
  logs = "";
let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log("PASS " + name);
}
try {
  replica = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { checkMD5: true },
  });
  const uri = replica.getUri("leron_isolated_test");
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  await prepareIndexes(db);
  await prepareIndexes(db);
  await db.collection("products").insertMany([
    {
      sku: "test-a",
      slug: "test-a",
      name: "Test Headphones",
      category: "Audio",
      description: "Isolated fixture",
      tagline: "Test",
      prices: { USD: 12900, KES: 1690000 },
      image: "headphones",
      features: [],
      stock: 5,
      active: true,
      featured: false,
    },
    {
      sku: "test-b",
      slug: "test-b",
      name: "Test Speaker",
      category: "Audio",
      description: "Isolated fixture",
      prices: { USD: 5900, KES: 790000 },
      image: "speaker",
      stock: 1,
      active: true,
    },
  ]);
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3200",
    ],
    {
      env: {
        ...process.env,
        MONGODB_URI: uri,
        APP_ORIGIN: origin,
        CHECKOUT_COOKIE_SECRET: cookieSecret,
        ADMIN_SESSION_SECRET: adminSecret,
        ADMIN_PASSWORD_HASH: adminHash,
        COMMERCE_LIVE: "true",
        TAX_POLICY_APPROVED: "true",
        SHIPPING_RATES_JSON: JSON.stringify({
          US: { USD: 1500 },
          KE: { KES: 30000 },
        }),
        STRIPE_SECRET_KEY: "sk_test_disposable_fixture_not_a_real_key",
        STRIPE_WEBHOOK_SECRET: webhookSecret,
        CRON_SECRET: cronSecret,
        RESEND_API_KEY: "",
        EMAIL_FROM: "",
        MPESA_TAX_APPROVED: "false",
        MPESA_CALLBACK_TOKEN: callbackToken,
        MPESA_CONSUMER_KEY: "",
        MPESA_CONSUMER_SECRET: "",
        MPESA_PASSKEY: "",
        MPESA_SHORTCODE: "",
        MPESA_CALLBACK_URL: "",
        MPESA_ENV: "sandbox",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (s) => (logs += s));
  server.stderr.on("data", (s) => (logs += s));
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(origin + "/admin");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    if (server.exitCode !== null) break;
    await delay(100);
  }
  assert.ok(ready, "Isolated application server must start");
  const token = randomBytes(32).toString("hex"),
    cookie = "guest_checkout=" + token,
    ownerTokenHash = createHmac("sha256", cookieSecret)
      .update(token)
      .digest("hex");
  const address = {
    name: "Test Customer",
    email: "test@example.com",
    phone: "+12025550123",
    line1: "123 Example Road",
    city: "Example City",
    region: "CA",
    postalCode: "90001",
    country: "US",
  };
  const body = (items = [{ sku: "test-a", qty: 1 }]) => ({
    items,
    currency: "USD",
    address,
  });
  async function order(
    data,
    key = randomBytes(16).toString("hex"),
    auth = cookie,
  ) {
    const r = await fetch(origin + "/api/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie: auth,
        "idempotency-key": key,
      },
      body: JSON.stringify(data),
    });
    return { status: r.status, data: await r.json() };
  }
  let first;
  await check("server prices, shipping and stock reservation", async () => {
    first = await order(body());
    assert.equal(first.status, 201);
    assert.equal(first.data.amountMinor, 14400);
    assert.equal(
      (await db.collection("products").findOne({ sku: "test-a" })).stock,
      4,
    );
  });
  await check(
    "idempotency replay creates one order and rejects changed input",
    async () => {
      const key = randomBytes(16).toString("hex");
      const a = await order(body(), key),
        b = await order(body(), key);
      assert.equal(a.status, 201);
      assert.equal(b.status, 201);
      assert.equal(a.data.orderId, b.data.orderId);
      assert.equal(
        (await order(body([{ sku: "test-a", qty: 2 }]), key)).status,
        409,
      );
      assert.equal(
        await db.collection("orders").countDocuments({ idempotencyKey: key }),
        1,
      );
    },
  );
  await check(
    "simultaneous requests with the same idempotency key replay one reservation",
    async () => {
      const key = randomBytes(16).toString("hex"),
        before = (await db.collection("products").findOne({ sku: "test-a" }))
          .stock;
      const results = await Promise.all([
        order(body(), key),
        order(body(), key),
      ]);
      assert.deepEqual(
        results.map((r) => r.status),
        [201, 201],
      );
      assert.equal(results[0].data.orderId, results[1].data.orderId);
      assert.equal(
        (await db.collection("products").findOne({ sku: "test-a" })).stock,
        before - 1,
      );
    },
  );
  await check(
    "transaction rolls back partial reservations when another item is unavailable",
    async () => {
      const before = (
        await db.collection("products").findOne({ sku: "test-a" })
      ).stock;
      const r = await order(
        body([
          { sku: "test-a", qty: 1 },
          { sku: "zz-missing", qty: 1 },
        ]),
      );
      assert.equal(r.status, 409);
      assert.equal(
        (await db.collection("products").findOne({ sku: "test-a" })).stock,
        before,
      );
    },
  );
  await check("concurrent orders cannot oversell the last item", async () => {
    const results = await Promise.all([
      order(body([{ sku: "test-b", qty: 1 }])),
      order(body([{ sku: "test-b", qty: 1 }])),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    assert.equal(
      (await db.collection("products").findOne({ sku: "test-b" })).stock,
      0,
    );
  });
  await check(
    "tampered prices and unsupported shipping countries are rejected",
    async () => {
      assert.equal((await order({ ...body(), amountMinor: 1 })).status, 400);
      assert.equal(
        (await order({ ...body(), address: { ...address, country: "ZZ" } }))
          .status,
        400,
      );
    },
  );
  await check(
    "guest order isolation prevents cross-session reads",
    async () => {
      const good = await fetch(origin + "/api/orders/" + first.data.orderId, {
        headers: { cookie },
      });
      assert.equal(good.status, 200);
      const bad = await fetch(origin + "/api/orders/" + first.data.orderId, {
        headers: {
          cookie: "guest_checkout=" + randomBytes(32).toString("hex"),
        },
      });
      assert.equal(bad.status, 404);
    },
  );
  const stripe = new Stripe("sk_test_disposable_fixture_not_a_real_key");
  async function webhook(type, session) {
    const payload = JSON.stringify({
      id: "evt_" + randomBytes(12).toString("hex"),
      object: "event",
      type,
      data: { object: session },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });
    return fetch(origin + "/api/payments/stripe/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signature,
      },
      body: payload,
    });
  }
  let paidId;
  await check(
    "signed card completion and duplicate delivery mark paid only once",
    async () => {
      paidId = new mongoose.Types.ObjectId(first.data.orderId);
      await db.collection("orders").updateOne(
        { _id: paidId },
        {
          $set: { paymentMethod: "stripe", stripeSessionId: "cs_test_paid" },
        },
      );
      const session = {
        id: "cs_test_paid",
        metadata: { orderId: first.data.orderId },
        client_reference_id: first.data.orderId,
        payment_status: "paid",
        currency: "usd",
        amount_subtotal: 14400,
        amount_total: 15552,
        total_details: { amount_tax: 1152 },
      };
      assert.equal(
        (await webhook("checkout.session.completed", session)).status,
        200,
      );
      assert.equal(
        (await webhook("checkout.session.completed", session)).status,
        200,
      );
      const saved = await db.collection("orders").findOne({ _id: paidId });
      assert.equal(saved.status, "paid");
      assert.equal(saved.totalPaidMinor, 15552);
      assert.equal(saved.taxMinor, 1152);
    },
  );
  await check(
    "signed payment with mismatched amount is held for review",
    async () => {
      const r = await order(body());
      assert.equal(r.status, 201);
      await db.collection("orders").updateOne(
        { _id: new mongoose.Types.ObjectId(r.data.orderId) },
        {
          $set: {
            paymentMethod: "stripe",
            stripeSessionId: "cs_test_mismatch",
          },
        },
      );
      assert.equal(
        (
          await webhook("checkout.session.completed", {
            id: "cs_test_mismatch",
            metadata: { orderId: r.data.orderId },
            client_reference_id: r.data.orderId,
            payment_status: "paid",
            currency: "usd",
            amount_subtotal: 1,
            amount_total: 1,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await db
            .collection("orders")
            .findOne({ _id: new mongoose.Types.ObjectId(r.data.orderId) })
        ).status,
        "review",
      );
    },
  );
  await check(
    "expired card session releases inventory exactly once",
    async () => {
      const r = await order(body());
      assert.equal(r.status, 201);
      const id = new mongoose.Types.ObjectId(r.data.orderId),
        before = (await db.collection("products").findOne({ sku: "test-a" }))
          .stock;
      await db.collection("orders").updateOne(
        { _id: id },
        {
          $set: {
            paymentMethod: "stripe",
            stripeSessionId: "cs_test_expired",
          },
        },
      );
      const s = {
        id: "cs_test_expired",
        metadata: { orderId: r.data.orderId },
        client_reference_id: r.data.orderId,
      };
      assert.equal((await webhook("checkout.session.expired", s)).status, 200);
      assert.equal((await webhook("checkout.session.expired", s)).status, 200);
      assert.equal(
        (await db.collection("products").findOne({ sku: "test-a" })).stock,
        before + 1,
      );
      assert.equal(
        (await db.collection("orders").findOne({ _id: id })).status,
        "cancelled",
      );
    },
  );
  let adminCookie;
  await check(
    "admin authentication and paid-only fulfillment transitions",
    async () => {
      const login = await fetch(origin + "/api/admin/login", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ password: adminPassword }),
      });
      assert.equal(login.status, 200);
      adminCookie = login.headers.get("set-cookie").split(";")[0];
      const list = await fetch(origin + "/api/admin/orders", {
        headers: { cookie: adminCookie },
      });
      assert.equal(list.status, 200);
      const patch = async (id, fulfillment, trackingNumber = "") =>
        fetch(origin + "/api/admin/orders", {
          method: "PATCH",
          headers: {
            origin,
            cookie: adminCookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            orderId: String(id),
            fulfillment,
            trackingNumber,
          }),
        });
      assert.equal((await patch(paidId, "shipped", "TRACK")).status, 409);
      assert.equal((await patch(paidId, "processing")).status, 200);
      assert.equal((await patch(paidId, "shipped")).status, 400);
      assert.equal((await patch(paidId, "shipped", "TRACK-123")).status, 200);
      assert.equal((await patch(paidId, "delivered", "TRACK-123")).status, 200);
      const unpaid = await db
        .collection("orders")
        .findOne({ status: "unpaid" });
      assert.equal((await patch(unpaid._id, "processing")).status, 409);
    },
  );
  await check(
    "admin draft imports are repeatable, inactive and do not overwrite existing products",
    async () => {
      for (let i = 0; i < 2; i++) {
        const r = await fetch(origin + "/api/admin/products", {
          method: "POST",
          headers: {
            origin,
            cookie: adminCookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({ action: "seed-drafts" }),
        });
        assert.equal(r.status, 200);
      }
      const drafts = await db
        .collection("products")
        .find({ sku: /^lu-/ })
        .toArray();
      assert.equal(drafts.length, 6);
      assert.ok(drafts.every((p) => p.stock === 0 && !p.active));
      assert.equal(
        await db.collection("products").countDocuments({ sku: "test-a" }),
        1,
      );
    },
  );
  await check(
    "early M-Pesa callbacks persist once before a matching payment exists",
    async () => {
      const payload = {
        Body: {
          stkCallback: {
            CheckoutRequestID: "early-checkout",
            MerchantRequestID: "early-merchant",
            ResultCode: 1032,
            ResultDesc: "Fixture cancellation",
          },
        },
      };
      for (let i = 0; i < 2; i++) {
        const r = await fetch(
          origin + "/api/mpesa/callback?token=" + callbackToken,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        assert.equal(r.status, 200);
      }
      assert.equal(
        await db
          .collection("callbackinboxes")
          .countDocuments({ checkoutRequestId: "early-checkout" }),
        1,
      );
    },
  );
  await check(
    "invalid Stripe signatures never mutate order state",
    async () => {
      const r = await fetch(origin + "/api/payments/stripe/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "stripe-signature": "t=1,v1=invalid",
        },
        body: JSON.stringify({ type: "checkout.session.completed" }),
      });
      assert.equal(r.status, 400);
      assert.equal(
        (await db.collection("orders").findOne({ _id: paidId })).status,
        "paid",
      );
    },
  );
  await check(
    "cron authentication and abandoned-order expiration",
    async () => {
      const unpaid = await db
        .collection("orders")
        .findOne({ status: "unpaid", paymentMethod: { $exists: false } });
      assert.ok(unpaid);
      await db
        .collection("orders")
        .updateOne(
          { _id: unpaid._id },
          { $set: { reservationExpiresAt: new Date(Date.now() - 60000) } },
        );
      assert.equal(
        (await fetch(origin + "/api/internal/reconcile")).status,
        401,
      );
      const run = await fetch(origin + "/api/internal/reconcile", {
        headers: { authorization: "Bearer " + cronSecret },
      });
      assert.equal(run.status, 200);
      assert.equal(
        (await db.collection("orders").findOne({ _id: unpaid._id })).status,
        "cancelled",
      );
    },
  );
  await check(
    "receipt and fulfillment notifications commit durably without duplicate delivery jobs",
    async () => {
      const rows = await db.collection("emailoutboxes").find().toArray();
      assert.equal(rows.length, 4);
      assert.ok(rows.every((r) => r.status === "pending" && r.attempts === 0));
      assert.equal(
        rows.filter((r) => r.eventKey === `order:${paidId}:receipt`).length,
        1,
      );
    },
  );
  console.log(`${passed} isolated integration checks passed.`);
} catch (e) {
  console.error(e);
  console.error(
    "Isolated server output (credentials omitted by application logging):\n" +
      logs.slice(-5000),
  );
  process.exitCode = 1;
} finally {
  if (server) {
    server.kill("SIGTERM");
    if (server.exitCode === null)
      await new Promise((resolve) => server.once("exit", resolve));
  }
  await mongoose.disconnect();
  if (replica) await replica.stop();
}
