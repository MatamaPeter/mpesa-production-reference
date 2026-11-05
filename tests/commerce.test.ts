import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import {
  consolidateItems,
  checkedTotal,
  orderSchema,
  shippingQuote,
} from "../src/lib/commerce";
import {
  verifyPassword,
  signAdminSession,
  validAdminSession,
} from "../src/lib/admin-crypto";
import { formatMoney, draftProducts } from "../src/lib/catalog";

test("merges repeated SKUs before inventory reservation and enforces combined quantity limit", () => {
  assert.deepEqual(
    consolidateItems([
      { sku: "a", qty: 2 },
      { sku: "a", qty: 3 },
      { sku: "b", qty: 1 },
    ]),
    [
      { sku: "a", qty: 5 },
      { sku: "b", qty: 1 },
    ],
  );
  assert.throws(() =>
    consolidateItems([
      { sku: "a", qty: 6 },
      { sku: "a", qty: 5 },
    ]),
  );
});
test("money totals reject fractional, negative, zero and overflowing values", () => {
  assert.equal(checkedTotal([12900, 500, 0]), 13400);
  for (const amounts of [
    [1.5],
    [-1, 10],
    [0],
    [Number.MAX_SAFE_INTEGER, 1],
    [NaN],
    [Infinity],
  ])
    assert.throws(() => checkedTotal(amounts));
});
const order = {
  items: [{ sku: "lu-headphones", qty: 1 }],
  currency: "USD",
  address: {
    name: "Test Customer",
    email: "test@example.com",
    phone: "+12025550123",
    line1: "123 Example Road",
    city: "Test City",
    country: "US",
  },
};
test("order validation rejects client-supplied prices, invalid addresses and out-of-range quantities", () => {
  assert.equal(orderSchema.safeParse(order).success, true);
  assert.equal(
    orderSchema.safeParse({ ...order, amountMinor: 1 }).success,
    false,
  );
  assert.equal(
    orderSchema.safeParse({
      ...order,
      items: [{ sku: "lu-headphones", qty: 1, price: 1 }],
    }).success,
    false,
  );
  assert.equal(
    orderSchema.safeParse({ ...order, items: [{ sku: "a", qty: 0 }] }).success,
    false,
  );
  assert.equal(
    orderSchema.safeParse({
      ...order,
      address: { ...order.address, email: "invalid" },
    }).success,
    false,
  );
  assert.equal(
    orderSchema.safeParse({ ...order, currency: "EUR" }).success,
    false,
  );
});
test("shipping rejects unapproved countries, unsupported currencies and invalid rates", () => {
  const previous = process.env.SHIPPING_RATES_JSON;
  try {
    delete process.env.SHIPPING_RATES_JSON;
    assert.throws(() => shippingQuote("US", "USD"));
    process.env.SHIPPING_RATES_JSON = JSON.stringify({
      US: { USD: 1500 },
      KE: { KES: 0 },
      GB: { USD: -1 },
    });
    assert.equal(shippingQuote("US", "USD"), 1500);
    assert.equal(shippingQuote("KE", "KES"), 0);
    assert.throws(() => shippingQuote("US", "KES"));
    assert.throws(() => shippingQuote("CA", "USD"));
    assert.throws(() => shippingQuote("GB", "USD"));
  } finally {
    if (previous === undefined) delete process.env.SHIPPING_RATES_JSON;
    else process.env.SHIPPING_RATES_JSON = previous;
  }
});
test("admin password verification and session tampering, expiry and password rotation", () => {
  const salt = randomBytes(16).toString("hex"),
    hash =
      salt +
      ":" +
      scryptSync("a long unique test password", salt, 64).toString("hex"),
    secret = randomBytes(32).toString("hex"),
    now = 100000;
  assert.equal(verifyPassword("a long unique test password", hash), true);
  assert.equal(verifyPassword("wrong", hash), false);
  assert.equal(verifyPassword("anything", "bad"), false);
  const token = signAdminSession(secret, hash, now);
  assert.equal(validAdminSession(token, secret, hash, now + 1), true);
  assert.equal(validAdminSession(token + "x", secret, hash, now), false);
  assert.equal(
    validAdminSession(token, secret, hash, now + 8 * 3600000),
    false,
  );
  assert.equal(validAdminSession(token, secret, "rotated hash", now), false);
  assert.equal(validAdminSession(token, "different secret", hash, now), false);
  assert.equal(validAdminSession("not-json.token", secret, hash, now), false);
});
test("draft catalog contains unique URLs, safe integer minor-unit prices and no sellable stock", () => {
  assert.equal(
    new Set(draftProducts.map((p) => p.sku)).size,
    draftProducts.length,
  );
  assert.equal(
    new Set(draftProducts.map((p) => p.slug)).size,
    draftProducts.length,
  );
  for (const p of draftProducts) {
    assert.equal(p.stock, 0);
    for (const amount of Object.values(p.prices))
      assert.ok(Number.isSafeInteger(amount) && amount > 0);
    assert.equal(p.prices.KES % 100, 0);
  }
  assert.match(formatMoney(12900, "USD"), /129/);
  assert.match(formatMoney(1690000, "KES"), /16,900/);
});

test("Kenyan phone normalization accepts supported formats and rejects invalid prefixes and characters", async () => {
  const { normalizePhone } = await import("../src/lib/phone");
  for (const phone of [
    "0712345678",
    "712345678",
    "254712345678",
    "+254 712 345 678",
  ])
    assert.equal(normalizePhone(phone), "254712345678");
  for (const phone of ["123", "+12025550123", "0712345678abc", "254212345678"])
    assert.throws(() => normalizePhone(phone));
});
test("M-Pesa evidence requires exact identifiers, amount, phone and a unique receipt field", async () => {
  const { receiptFromCallback } = await import("../src/lib/payment-evidence");
  const payload = {
    CheckoutRequestID: "checkout-test",
    MerchantRequestID: "merchant-test",
    ResultCode: 0,
    CallbackMetadata: {
      Item: [
        { Name: "Amount", Value: 1500 },
        { Name: "PhoneNumber", Value: 254712345678 },
        { Name: "MpesaReceiptNumber", Value: "TESTRECEIPT" },
      ],
    },
  };
  const payment = {
    callbackPayload: payload,
    checkoutRequestId: "checkout-test",
    merchantRequestId: "merchant-test",
    amount: 1500,
    phone: "254712345678",
  };
  assert.equal(receiptFromCallback(payment), "TESTRECEIPT");
  assert.equal(receiptFromCallback({ ...payment, amount: 1 }), null);
  assert.equal(
    receiptFromCallback({ ...payment, phone: "254711111111" }),
    null,
  );
  assert.equal(
    receiptFromCallback({ ...payment, checkoutRequestId: "different" }),
    null,
  );
  assert.equal(
    receiptFromCallback({ ...payment, merchantRequestId: "different" }),
    null,
  );
  assert.equal(
    receiptFromCallback({
      ...payment,
      callbackPayload: { ...payload, ResultCode: 1032 },
    }),
    null,
  );
  assert.equal(
    receiptFromCallback({
      ...payment,
      callbackPayload: {
        ...payload,
        CallbackMetadata: {
          Item: [
            ...payload.CallbackMetadata.Item,
            { Name: "Amount", Value: 1500 },
          ],
        },
      },
    }),
    null,
  );
  assert.equal(
    receiptFromCallback({ ...payment, callbackPayload: null }),
    null,
  );
});

test("product media paths cannot select remote resources or traverse directories", async () => {
  const { validProductImage, productImage } =
    await import("../src/lib/catalog");
  assert.equal(productImage("headphones"), "/products/headphones.svg");
  assert.equal(
    productImage("/products/approved-camera.webp"),
    "/products/approved-camera.webp",
  );
  for (const path of [
    "https://example.com/photo.png",
    "/products/../private.png",
    "/products//photo.png",
    "/other/photo.jpg",
    "/products/script.svg",
    "javascript:alert(1)",
  ])
    assert.equal(validProductImage(path), false);
});
