import { site } from "@/config/site";
import { z } from "zod";
export const addressSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  phone: z.string().trim().min(7).max(24),
  line1: z.string().trim().min(3).max(160),
  line2: z.string().trim().max(160).default(""),
  city: z.string().trim().min(2).max(100),
  region: z.string().trim().max(100).default(""),
  postalCode: z.string().trim().max(20).default(""),
  country: z.string().regex(/^[A-Z]{2}$/),
});
export const orderSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            sku: z.string().regex(/^[a-z0-9-]{1,80}$/),
            qty: z.number().int().min(1).max(10),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    currency: z
      .string()
      .refine((c) => site.currencies.includes(c), "Unsupported currency"),
    termsAccepted: z.literal(true),
    couponCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{0,32}$/)
      .default(""),
    address: addressSchema,
  })
  .strict();
/** Shopper-safe validation guidance: never echo submitted personal data. */
export function orderValidationMessage(
  issues: readonly { path: readonly PropertyKey[] }[],
) {
  const path = issues[0]?.path ?? [];
  const addressMessages: Record<string, string> = {
    name: "Enter a delivery name between 2 and 100 characters.",
    email: "Enter a valid email address, with no surrounding spaces.",
    phone: "Enter a delivery phone number between 7 and 24 characters.",
    line1: "Enter a street or building address between 3 and 160 characters.",
    line2: "Keep the additional address line within 160 characters.",
    city: "Enter a town or city between 2 and 100 characters.",
    region: "Keep the county or region within 100 characters.",
    postalCode: "Keep the postal code within 20 characters.",
    country: "Select a delivery country from the list.",
  };
  if (path[0] === "address")
    return addressMessages[String(path[1])] ?? "Check your delivery address.";
  if (path[0] === "termsAccepted")
    return "Accept the terms of sale and acknowledge the privacy notice before continuing.";
  if (path[0] === "couponCode")
    return "Use a coupon code of at most 32 letters, numbers or hyphens, or leave it blank.";
  if (path[0] === "currency")
    return "Choose a supported currency using the store currency selector.";
  if (path[0] === "items") {
    if (path[2] === "qty")
      return "Use a whole quantity from 1 to 10 for each product in your bag.";
    if (path[2] === "sku")
      return "Your bag contains an invalid product reference. Remove that item and add it again.";
    return "Check your bag: use 1–20 products with valid product references and quantities.";
  }
  return "Checkout data is invalid or outdated. Refresh the page and review your bag.";
}
export function consolidateItems(items: { sku: string; qty: number }[]) {
  const map = new Map<string, number>();
  for (const i of items) map.set(i.sku, (map.get(i.sku) ?? 0) + i.qty);
  const result = [...map].map(([sku, qty]) => ({ sku, qty }));
  if (result.some((i) => i.qty > 10))
    throw new Error("Maximum 10 units per product");
  return result;
}
export function checkedTotal(amounts: number[]) {
  const total = amounts.reduce((a, b) => a + b, 0);
  if (
    !amounts.every((n) => Number.isSafeInteger(n) && n >= 0) ||
    !Number.isSafeInteger(total) ||
    total <= 0
  )
    throw new Error("Invalid total");
  return total;
}
export function shippingQuote(country: string, currency: string) {
  if (
    process.env.COMMERCE_STAGE === "live" &&
    !site.launchCountries.includes(country)
  )
    throw new Error("This destination is not in the approved launch market");
  const raw = process.env.SHIPPING_RATES_JSON;
  if (!raw) throw new Error("Shipping is not configured for this destination");
  const rates = JSON.parse(raw) as Record<string, Record<string, number>>;
  const amount = rates[country]?.[currency];
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new Error(
      "Shipping is not available for this destination and currency",
    );
  return amount;
}
