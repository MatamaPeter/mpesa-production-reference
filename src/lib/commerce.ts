import { z } from "zod";
export const addressSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().max(254),
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
    currency: z.enum(["USD", "KES"]),
    address: addressSchema,
  })
  .strict();
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
export function shippingQuote(country: string, currency: "USD" | "KES") {
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
