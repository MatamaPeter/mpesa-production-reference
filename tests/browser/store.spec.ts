import { test, expect } from "@playwright/test";

test("collection filters, searches and sorts without hydration errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Less ordinary",
  );
  await expect(page.locator(".product-card")).toHaveCount(6);
  await page.getByRole("button", { name: "Audio", exact: true }).click();
  await expect(page.locator(".product-card")).toHaveCount(2);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByRole("textbox", { name: "Search products" }).fill("watch");
  await expect(page.locator(".product-card")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "Search products" })
    .fill("not-a-real-product");
  await expect(page.getByText("No essentials found.")).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page.locator(".product-card")).toHaveCount(6);
  await page.getByLabel("Sort by").selectOption("price-low");
  await expect(page.locator(".product-card").first()).toContainText(
    "Flow Charger",
  );
  expect(errors).toEqual([]);
});

test("bag persists, quantities update, currency switches and preview checkout never takes payments", async ({
  page,
}) => {
  await page.goto("/products/studio-wireless-headphones");
  await page.getByRole("button", { name: "Add to preview bag" }).click();
  await page.goto("/cart");
  await expect(
    page.getByRole("heading", { name: "Studio Wireless" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Increase Studio Wireless quantity" })
    .click();
  await expect(page.locator(".quantity output")).toHaveText("2");
  await page.getByLabel("Display currency").selectOption("KES");
  await expect(page.locator(".summary-line").first()).toContainText("33,800");
  await page.reload();
  await expect(page.locator(".quantity output")).toHaveText("2");
  await expect(page.getByLabel("Display currency")).toHaveValue("KES");
  await page.getByRole("link", { name: "Preview checkout" }).click();
  await expect(page.getByText("Preview mode.", { exact: false })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue to payment" }),
  ).toBeDisabled();
  await page.goto("/cart");
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Room for something good." }),
  ).toBeVisible();
});

test("security and closed-commerce API boundaries", async ({ request }) => {
  expect((await request.post("/api/orders", { data: {} })).status()).toBe(403);
  const closed = await request.post("/api/orders", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: {},
  });
  expect(closed.status()).toBe(503);
  expect((await request.get("/api/admin/products")).status()).toBe(401);
  expect((await request.get("/api/admin/orders")).status()).toBe(401);
  expect(
    (await request.get("/api/orders/123456789012345678901234")).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/payments/stripe", {
        headers: { origin: "http://127.0.0.1:3100" },
        data: {},
      })
    ).status(),
  ).toBe(503);
  expect(
    (
      await request.post("/api/mpesa/stk-push", {
        headers: { origin: "http://127.0.0.1:3100" },
        data: {},
      })
    ).status(),
  ).toBe(503);
  expect(
    (await request.post("/api/mpesa/callback", { data: {} })).status(),
  ).toBe(401);
  expect(
    (await request.post("/api/payments/stripe/webhook", { data: {} })).status(),
  ).toBe(400);
  const home = await request.get("/");
  expect(home.headers()["content-security-policy"]).toContain(
    "'strict-dynamic'",
  );
  expect(home.headers()["x-content-type-options"]).toBe("nosniff");
  expect(home.headers()["x-frame-options"]).toBe("DENY");
});

test("product links, policies, administration and missing pages remain usable", async ({
  page,
}) => {
  await page.goto("/products/pulse-portable-speaker");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Pulse Mini",
  );
  await page.goto("/policies/shipping");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Shipping & delivery",
  );
  await expect(page.getByText("DRAFT POLICY", { exact: false })).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByLabel("Administrator password")).toBeVisible();
  await page.goto("/products/missing-product");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "This one’s out of range.",
  );
});

test("responsive storefront has no horizontal overflow and supports mobile menu", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Toggle menu" }).click();
    await page
      .getByRole("link", { name: "Our story", exact: true })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "in motion",
    );
  }
  await page.screenshot({
    path: `test-results/store-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("main shopping pages have no serious or critical automated accessibility findings", async ({
  page,
}) => {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  for (const path of [
    "/",
    "/products/studio-wireless-headphones",
    "/cart",
    "/admin",
  ]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
  }
});
