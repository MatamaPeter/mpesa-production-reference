import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { ObjectId } from "mongodb";
import { site, storageKey, sessionCookies } from "../src/config/site.ts";

// Only called by the isolated integration harness, never against merchant data.
export async function authenticatedBrowserChecks(db, origin) {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    args: ["--no-sandbox"],
  });
  try {
    const id = new ObjectId(),
      token = randomBytes(32).toString("hex");
    await db.collection("customers").insertOne({
      _id: id,
      email: "browser-owner@example.com",
      name: "Browser Owner",
      role: "owner",
      disabled: false,
      verifiedAt: new Date(),
      addresses: [],
      wishlist: ["test-a"],
    });
    await db.collection("customersessions").insertOne({
      _id: createHash("sha256").update(token).digest("hex"),
      customerId: id,
      expiresAt: new Date(Date.now() + 3600000),
      mfaAt: new Date(),
    });
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: sessionCookies.customer,
        value: token,
        url: origin,
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ]);
    await context.addInitScript(
      ({ key }) => {
        if (!localStorage.getItem(key))
          localStorage.setItem(
            key,
            JSON.stringify({
              wishlist: ["test-b"],
              comparison: [],
              recent: [],
            }),
          );
      },
      { key: storageKey("saved-v1") },
    );
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin + "/account");
    await expect(
      page.getByText("browser-owner@example.com", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key)).wishlist,
          storageKey("saved-v1"),
        ),
      )
      .toEqual(["test-b"]);
    console.log(
      "PASS authenticated browser account rendering preserves separate guest wishlist storage",
    );

    await page.goto(origin + "/admin/operations");
    for (const [label, endpoint] of [
      ["Inventory", "inventory"],
      ["Promotions", "coupons"],
      ["Returns", "returns"],
      ["Refunds", "refunds"],
      ["Support", "support"],
      ["Staff", "staff"],
      ["Launch checks", "readiness"],
    ]) {
      const response = page.waitForResponse(
        (r) =>
          r.url() === `${origin}/api/admin/${endpoint}` &&
          r.request().method() === "GET",
      );
      await page.getByRole("button", { name: label, exact: true }).click();
      assert.equal(
        (await response).status(),
        200,
        label + " data must be authorized",
      );
      await expect(
        page.getByText("Loading operations…", { exact: true }),
      ).toHaveCount(0);
    }
    console.log(
      "PASS authenticated browser renders staff operational queues without hydration errors",
    );

    await page.goto(origin + "/admin");
    await page.getByText("+ Create a product", { exact: true }).click();
    const form = page.locator("details.admin-product").first();
    await form
      .getByLabel("SKU", { exact: true })
      .fill("browser-decimal-fixture");
    await form
      .getByLabel("URL slug", { exact: true })
      .fill("browser-decimal-fixture");
    await form
      .getByLabel("Product name", { exact: true })
      .fill("Browser Decimal Fixture");
    await form
      .getByLabel("Description", { exact: true })
      .fill("Disposable browser product to verify decimal price entry.");
    await form.getByLabel("USD price", { exact: true }).fill("12.34");
    await form.getByLabel("KES price", { exact: true }).fill("1500");
    const saved = page.waitForResponse(
      (r) =>
        r.url() === origin + "/api/admin/products" &&
        r.request().method() === "POST",
    );
    await form
      .getByRole("button", { name: "Save product", exact: true })
      .click();
    assert.equal((await saved).status(), 200);
    const product = await db
      .collection("products")
      .findOne({ sku: "browser-decimal-fixture" });
    assert.equal(product.prices.USD, 1234);
    assert.equal(product.prices.KES, 150000);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByLabel("Administrator password")).toBeVisible();
    assert.equal(
      (await context.request.get(origin + "/api/admin/orders")).status(),
      401,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS authenticated browser saves decimal prices correctly and staff sign-out revokes access",
    );
    await context.close();
  } finally {
    await browser.close();
  }
}
