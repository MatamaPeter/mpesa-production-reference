import assert from "node:assert/strict";
import { randomBytes, createHmac, scryptSync } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import Stripe from "stripe";
import sharp from "sharp";
import { totpAt } from "../src/lib/security.ts";
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
        ADMIN_BOOTSTRAP_ENABLED: "true",
        ACCOUNT_AUTH_ENABLED: "true",
        AUTH_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
        COMMERCE_LIVE: "true",
        COMMERCE_STAGE: "sandbox",
        PAYMENT_WORKER_ENABLED: "false",
        SHIPPING_TRACKING_ENABLED: "false",
        SHIPPING_LABEL_PURCHASE_ENABLED: "false",
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
    termsAccepted: true,
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
  await check(
    "invalid delivery details give actionable errors before reserving stock",
    async () => {
      const before = await db.collection("orders").countDocuments();
      const badPhone = await order({
        ...body(),
        address: { ...address, phone: "123" },
      });
      assert.equal(badPhone.status, 400);
      assert.match(badPhone.data.error, /phone number/);
      const consent = await order({ ...body(), termsAccepted: false });
      assert.equal(consent.status, 400);
      assert.match(consent.data.error, /Accept the terms/);
      assert.equal(await db.collection("orders").countDocuments(), before);
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

  let accountCookie, accountId, authToken;
  const accountEmail = "test@example.com";
  async function accountRequest(
    path,
    body,
    auth = accountCookie,
    method = "POST",
  ) {
    const r = await fetch(origin + path, {
      method,
      headers: {
        origin,
        "content-type": "application/json",
        ...(auth ? { cookie: auth } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  }
  await check(
    "one-time customer links queue securely, resist scanners and link owned guest orders",
    async () => {
      const requested = await accountRequest(
        "/api/account/auth/request",
        { email: accountEmail, name: "Account Test" },
        cookie,
      );
      assert.equal(requested.status, 200);
      const mail = await db
        .collection("emailoutboxes")
        .findOne({ to: accountEmail, eventKey: /^auth:/ });
      assert.ok(mail);
      authToken = mail.text.match(/token=([a-f0-9]{64})/)[1];
      assert.equal(
        (await fetch(origin + "/account/verify?token=" + authToken)).status,
        200,
      );
      assert.equal(
        (await db.collection("authtokens").findOne({ email: accountEmail }))
          .usedAt,
        undefined,
      );
      const verified = await accountRequest(
        "/api/account/auth/verify",
        { token: authToken },
        cookie,
      );
      assert.equal(verified.status, 200);
      accountCookie = verified.cookie;
      assert.ok(accountCookie);
      assert.equal(
        (
          await accountRequest(
            "/api/account/auth/verify",
            { token: authToken },
            cookie,
          )
        ).status,
        400,
      );
      const profile = await accountRequest(
        "/api/account",
        undefined,
        accountCookie,
        "GET",
      );
      assert.equal(profile.data.user.email, accountEmail);
      accountId = profile.data.user.id;
      assert.ok(profile.data.orders.some((o) => o._id === String(paidId)));
    },
  );
  await check(
    "signed-in customers can access linked orders on a new device without the guest cookie",
    async () => {
      const r = await accountRequest(
        "/api/orders/" + paidId,
        undefined,
        accountCookie,
        "GET",
      );
      assert.equal(r.status, 200);
      assert.equal(
        (
          await accountRequest(
            "/api/admin/orders",
            undefined,
            accountCookie,
            "GET",
          )
        ).status,
        401,
      );
    },
  );
  await check(
    "wishlist changes persist on the account and reject invalid SKUs",
    async () => {
      assert.equal(
        (
          await accountRequest(
            "/api/account/wishlist",
            { sku: "test-a", action: "add" },
            accountCookie,
            "PATCH",
          )
        ).status,
        200,
      );
      assert.deepEqual(
        (
          await accountRequest(
            "/api/account/wishlist",
            undefined,
            accountCookie,
            "GET",
          )
        ).data.items,
        ["test-a"],
      );
      assert.equal(
        (
          await accountRequest(
            "/api/account/wishlist",
            { sku: "../private", action: "add" },
            accountCookie,
            "PATCH",
          )
        ).status,
        400,
      );
    },
  );
  await check(
    "only verified purchasers may submit reviews and unpublished reviews stay private",
    async () => {
      assert.equal(
        (
          await accountRequest("/api/reviews", {
            sku: "test-a",
            rating: 5,
            title: "Great fixture",
            body: "A sufficiently detailed test review.",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await accountRequest("/api/reviews", {
            sku: "not-purchased",
            rating: 5,
            title: "Invalid claim",
            body: "This purchase never took place.",
          })
        ).status,
        403,
      );
      const publicReviews = await fetch(origin + "/api/reviews?sku=test-a");
      assert.equal((await publicReviews.json()).count, 0);
      const review = await db.collection("reviews").findOne({ sku: "test-a" });
      assert.equal(
        (
          await accountRequest(
            "/api/admin/reviews",
            { id: String(review._id), status: "approved" },
            adminCookie,
            "PATCH",
          )
        ).status,
        200,
      );
      assert.equal(
        (await (await fetch(origin + "/api/reviews?sku=test-a")).json()).count,
        1,
      );
    },
  );
  await check(
    "staff MFA is encrypted, rejects replay and gates administrative access",
    async () => {
      await db
        .collection("customers")
        .updateOne(
          { _id: new mongoose.Types.ObjectId(accountId) },
          { $set: { role: "owner" } },
        );
      assert.equal(
        (
          await accountRequest(
            "/api/admin/orders",
            undefined,
            accountCookie,
            "GET",
          )
        ).status,
        401,
      );
      const setup = await accountRequest("/api/account/security", {
        action: "setup",
      });
      assert.equal(setup.status, 200);
      assert.ok(setup.data.secret);
      const saved = await db
        .collection("customers")
        .findOne({ _id: new mongoose.Types.ObjectId(accountId) });
      assert.notEqual(saved.totpPending, setup.data.secret);
      const counter = Math.floor(Date.now() / 30000),
        code = totpAt(setup.data.secret, counter),
        activated = await accountRequest("/api/account/security", {
          action: "activate",
          code,
        });
      assert.equal(activated.status, 200);
      assert.equal(activated.data.recoveryCodes.length, 8);
      assert.equal(
        (
          await accountRequest("/api/account/security", {
            action: "challenge",
            code,
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await accountRequest(
            "/api/admin/orders",
            undefined,
            accountCookie,
            "GET",
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await accountRequest(
            "/api/admin/staff",
            { email: accountEmail, role: "customer", disabled: false },
            accountCookie,
            "PATCH",
          )
        ).status,
        409,
      );
    },
  );
  await check(
    "staff roles deny unauthorized catalog changes and sessions revoke across devices",
    async () => {
      await db
        .collection("customers")
        .updateOne(
          { _id: new mongoose.Types.ObjectId(accountId) },
          { $set: { role: "warehouse" } },
        );
      assert.equal(
        (
          await accountRequest(
            "/api/admin/products",
            { action: "seed-drafts" },
            accountCookie,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await accountRequest(
            "/api/account",
            undefined,
            accountCookie,
            "DELETE",
          )
        ).status,
        200,
      );
      assert.equal(
        (await accountRequest("/api/account", undefined, accountCookie, "GET"))
          .data.user,
        null,
      );
    },
  );

  const promotionCookie = "guest_checkout=" + randomBytes(32).toString("hex");
  const extraProduct = {
    sku: "test-extra",
    slug: "test-extra",
    name: "Extra Test Headphones",
    category: "Audio",
    tagline: "Test catalog",
    description: "A product used only in isolated integration tests",
    prices: { USD: 10000, KES: 1300000 },
    image: "headphones",
    features: ["Isolated test"],
    stock: 50,
    active: true,
    featured: false,
  };
  await check(
    "catalog writes create variant SKUs without overwriting existing stock",
    async () => {
      assert.equal(
        (await accountRequest("/api/admin/products", extraProduct, adminCookie))
          .status,
        200,
      );
      assert.equal(
        (
          await accountRequest(
            "/api/admin/products",
            { ...extraProduct, stock: 999, name: "Updated Test Headphones" },
            adminCookie,
          )
        ).status,
        200,
      );
      assert.equal(
        (await db.collection("products").findOne({ sku: "test-extra" })).stock,
        50,
      );
      assert.equal(
        (
          await accountRequest(
            "/api/admin/products",
            {
              ...extraProduct,
              sku: "test-extra-blue",
              slug: "test-extra-blue",
              parentSku: "test-extra",
              attributes: [{ name: "Colour", value: "Blue" }],
              stock: 3,
            },
            adminCookie,
          )
        ).status,
        200,
      );
      assert.equal(
        (await fetch(origin + "/products/test-extra-blue")).status,
        200,
      );
    },
  );
  await check(
    "multi-warehouse transfers preserve totals, retry once and reject conflicting intent keys",
    async () => {
      assert.equal(
        (
          await accountRequest(
            "/api/admin/warehouses",
            { id: "secondary", name: "Secondary test warehouse" },
            adminCookie,
          )
        ).status,
        200,
      );
      const change = {
        sku: "test-extra",
        warehouse: "default",
        destination: "secondary",
        quantity: 12,
        reason: "Isolated transfer test",
        requestId: crypto.randomUUID(),
      };
      assert.equal(
        (await accountRequest("/api/admin/inventory", change, adminCookie))
          .status,
        200,
      );
      assert.equal(
        (await accountRequest("/api/admin/inventory", change, adminCookie))
          .status,
        200,
      );
      assert.equal(
        (
          await accountRequest(
            "/api/admin/inventory",
            { ...change, quantity: 13 },
            adminCookie,
          )
        ).status,
        409,
      );
      const balances = await db
        .collection("stockbalances")
        .find({ sku: "test-extra" })
        .toArray();
      assert.equal(
        balances.reduce((a, b) => a + b.available, 0),
        50,
      );
      assert.equal(
        balances.find((b) => b.warehouse === "secondary").available,
        12,
      );
    },
  );
  await check(
    "promotion capacity is reserved transactionally and released on abandoned checkout",
    async () => {
      const code = "SINGLE-USE",
        promo = {
          code,
          kind: "percent",
          value: 1000,
          currency: "USD",
          minimumSubtotal: 0,
          maxUses: 1,
          requireAccount: false,
          active: true,
          startsAt: new Date(Date.now() - 60000).toISOString(),
          endsAt: new Date(Date.now() + 3600000).toISOString(),
        };
      assert.equal(
        (await accountRequest("/api/admin/coupons", promo, adminCookie)).status,
        200,
      );
      const make = () =>
        order(
          { ...body([{ sku: "test-extra", qty: 1 }]), couponCode: code },
          undefined,
          promotionCookie,
        );
      const results = await Promise.all([make(), make()]);
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      const winner = results.find((r) => r.status === 201);
      const row = await db
        .collection("orders")
        .findOne({ _id: new mongoose.Types.ObjectId(winner.data.orderId) });
      assert.equal(row.discountMinor, 1000);
      assert.equal(row.amountMinor, 10500);
      assert.equal(row.items[0].lineTotalMinor, 9000);
      await db
        .collection("orders")
        .updateOne(
          { _id: row._id },
          { $set: { reservationExpiresAt: new Date(Date.now() - 60000) } },
        );
      assert.equal(
        (
          await fetch(origin + "/api/internal/reconcile", {
            headers: { authorization: "Bearer " + cronSecret },
          })
        ).status,
        200,
      );
      assert.equal(
        (await db.collection("coupons").findOne({ code })).reservedUses,
        0,
      );
    },
  );
  await check(
    "approved promotion redeems exactly once after verified card completion",
    async () => {
      const r = await order(
        {
          ...body([{ sku: "test-extra", qty: 1 }]),
          couponCode: "SINGLE-USE",
        },
        undefined,
        promotionCookie,
      );
      assert.equal(r.status, 201);
      await db.collection("orders").updateOne(
        { _id: new mongoose.Types.ObjectId(r.data.orderId) },
        {
          $set: { paymentMethod: "stripe", stripeSessionId: "cs_promotion" },
        },
      );
      const session = {
        id: "cs_promotion",
        metadata: { orderId: r.data.orderId },
        client_reference_id: r.data.orderId,
        payment_status: "paid",
        currency: "usd",
        amount_subtotal: 10500,
        amount_total: 10500,
        payment_intent: "pi_promotion",
        total_details: { amount_tax: 0 },
      };
      assert.equal(
        (await webhook("checkout.session.completed", session)).status,
        200,
      );
      assert.equal(
        (await webhook("checkout.session.completed", session)).status,
        200,
      );
      const coupon = await db
        .collection("coupons")
        .findOne({ code: "SINGLE-USE" });
      assert.equal(coupon.usedUses, 1);
      assert.equal(coupon.reservedUses, 0);
    },
  );
  await check(
    "partial refunds reserve the paid balance and signed confirmations settle once",
    async () => {
      await db
        .collection("orders")
        .updateOne(
          { _id: paidId },
          { $set: { stripePaymentIntent: "pi_first_fixture" } },
        );
      const refund = await accountRequest(
        "/api/admin/refunds",
        {
          orderId: String(paidId),
          amountMinor: 5000,
          reason: "Integration partial refund test",
          requestId: crypto.randomUUID(),
        },
        adminCookie,
      );
      assert.equal(refund.status, 202);
      assert.equal(
        (await db.collection("orders").findOne({ _id: paidId }))
          .refundReservedMinor,
        5000,
      );
      assert.equal(
        (
          await accountRequest(
            "/api/admin/refunds",
            {
              orderId: String(paidId),
              amountMinor: 12000,
              reason: "Would exceed the paid amount",
              requestId: crypto.randomUUID(),
            },
            adminCookie,
          )
        ).status,
        409,
      );
      const event = {
        id: "re_fixture",
        metadata: { refundId: refund.data.id, orderId: String(paidId) },
        status: "succeeded",
        amount: 5000,
        currency: "usd",
      };
      assert.equal((await webhook("refund.updated", event)).status, 200);
      assert.equal((await webhook("refund.updated", event)).status, 200);
      const record = await db.collection("orders").findOne({ _id: paidId });
      assert.equal(record.refundedMinor, 5000);
      assert.equal(record.refundReservedMinor, 0);
    },
  );
  await check(
    "return quantities cannot exceed purchases and physical restocking occurs once",
    async () => {
      const requestId = crypto.randomUUID(),
        created = await accountRequest(
          "/api/returns",
          {
            orderId: String(paidId),
            requestId,
            items: [{ sku: "test-a", qty: 1 }],
            reason: "The test product requires a return review",
          },
          cookie,
        );
      assert.equal(created.status, 201);
      assert.equal(
        (
          await accountRequest(
            "/api/returns",
            {
              orderId: String(paidId),
              requestId: crypto.randomUUID(),
              items: [{ sku: "test-a", qty: 1 }],
              reason: "Duplicate quantity must be rejected",
            },
            cookie,
          )
        ).status,
        409,
      );
      for (const action of ["approve", "receive"]) {
        assert.equal(
          (
            await accountRequest(
              "/api/admin/returns",
              {
                id: created.data.id,
                action,
                note: "Validated isolated return transition",
              },
              adminCookie,
              "PATCH",
            )
          ).status,
          200,
        );
      }
      const before = (
        await db.collection("products").findOne({ sku: "test-a" })
      ).stock;
      const restock = {
        id: created.data.id,
        action: "restock",
        warehouse: "default",
        note: "Physical return inspected and received",
      };
      assert.equal(
        (
          await accountRequest(
            "/api/admin/returns",
            restock,
            adminCookie,
            "PATCH",
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await accountRequest(
            "/api/admin/returns",
            restock,
            adminCookie,
            "PATCH",
          )
        ).status,
        409,
      );
      assert.equal(
        (await db.collection("products").findOne({ sku: "test-a" })).stock,
        before + 1,
      );
    },
  );
  await check(
    "image uploads strip unsafe formats, persist WebP assets and return immutable caching",
    async () => {
      const image = await sharp({
        create: { width: 8, height: 8, channels: 3, background: "#123456" },
      })
        .png()
        .toBuffer();
      const uploaded = await fetch(origin + "/api/admin/media", {
        method: "POST",
        headers: { origin, cookie: adminCookie, "content-type": "image/png" },
        body: image,
      });
      assert.equal(uploaded.status, 201);
      const asset = await uploaded.json(),
        response = await fetch(origin + asset.url);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "image/webp");
      assert.match(response.headers.get("cache-control"), /immutable/);
      assert.equal(
        (await sharp(Buffer.from(await response.arrayBuffer())).metadata())
          .format,
        "webp",
      );
      assert.equal(
        (
          await fetch(origin + "/api/admin/media", {
            method: "POST",
            headers: {
              origin,
              cookie: adminCookie,
              "content-type": "image/svg+xml",
            },
            body: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
          })
        ).status,
        415,
      );
    },
  );
  await check(
    "support replies are idempotent and audit history is available to authorized operators",
    async () => {
      const created = await accountRequest(
        "/api/support",
        {
          name: "Test Customer",
          email: "support-test@example.com",
          topic: "order",
          subject: "Integration support request",
          message: "Please help with this isolated fixture order.",
          website: "",
        },
        cookie,
      );
      assert.equal(created.status, 201);
      const reply = {
        id: created.data.id,
        status: "pending",
        reply: "Your fixture request has been reviewed.",
        requestId: crypto.randomUUID(),
      };
      assert.equal(
        (
          await accountRequest(
            "/api/admin/support",
            reply,
            adminCookie,
            "PATCH",
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await accountRequest(
            "/api/admin/support",
            reply,
            adminCookie,
            "PATCH",
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await db
            .collection("supporttickets")
            .findOne({ _id: new mongoose.Types.ObjectId(created.data.id) })
        ).messages.length,
        2,
      );
      const events = await accountRequest(
        "/api/admin/audit",
        undefined,
        adminCookie,
        "GET",
      );
      assert.equal(events.status, 200);
      assert.ok(events.data.items.length > 0);
    },
  );
  await check(
    "public indexed search, product lookup and operational cursors return bounded pages",
    async () => {
      const results = await (
        await fetch(origin + "/api/catalog?query=Headphones&currency=USD")
      ).json();
      assert.ok(results.items.some((p) => p.sku === "test-extra"));
      assert.ok(results.items.length <= 24);
      assert.equal(
        (
          await (
            await fetch(origin + "/api/catalog?skus=test-extra-blue")
          ).json()
        ).items[0].sku,
        "test-extra-blue",
      );
      const orders = await accountRequest(
        "/api/admin/orders",
        undefined,
        adminCookie,
        "GET",
      );
      assert.ok(Array.isArray(orders.data.items));
      assert.ok(orders.data.items.length <= 50);
      const ready = await accountRequest(
        "/api/admin/readiness",
        undefined,
        adminCookie,
        "GET",
      );
      assert.equal(ready.status, 200);
      assert.ok(ready.data.providerAcceptance);
    },
  );
  if (process.env.AUTH_BROWSER_TESTS === "true") {
    const { authenticatedBrowserChecks } =
      await import("./authenticated-browser.mjs");
    await authenticatedBrowserChecks(db, origin);
  }
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
