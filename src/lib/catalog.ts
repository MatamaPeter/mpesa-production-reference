// DEMO CATALOG ONLY. Replace with server-side database product/stock lookups.
export const catalog = {
  tshirt: { name: "Foundation T-shirt", priceKES: 1 },
  cap: { name: "Foundation Cap", priceKES: 1 },
} as const;
export type SKU = keyof typeof catalog;
export function isSKU(value: string): value is SKU { return Object.hasOwn(catalog, value); }
