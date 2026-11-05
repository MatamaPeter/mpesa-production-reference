export function discountAmount(
  subtotal: number,
  currency: string,
  coupon: {
    kind: string;
    value: number;
    minimumSubtotal: number;
    maxDiscount?: number;
    currency?: string;
  },
) {
  if (
    !Number.isSafeInteger(subtotal) ||
    subtotal <= 0 ||
    subtotal < coupon.minimumSubtotal
  )
    throw new Error("The order does not meet the promotion minimum");
  if (coupon.currency && coupon.currency !== currency)
    throw new Error("This promotion is not available in your currency");
  if (
    !Number.isSafeInteger(coupon.value) ||
    coupon.value <= 0 ||
    (coupon.kind === "percent" && coupon.value > 10000)
  )
    throw new Error("Invalid promotion value");
  let amount =
    coupon.kind === "percent"
      ? Number((BigInt(subtotal) * BigInt(coupon.value)) / 10000n)
      : coupon.value;
  amount = Math.min(amount, coupon.maxDiscount ?? subtotal, subtotal);
  const step = currency === "KES" ? 100 : 1;
  amount = Math.floor(amount / step) * step;
  if (amount <= 0 || amount >= subtotal)
    throw new Error("This promotion cannot make the merchandise total zero");
  return amount;
}
export function allocateDiscount(lines: number[], discount: number) {
  const total = lines.reduce((a, b) => a + b, 0);
  if (
    !Number.isSafeInteger(total) ||
    total <= 0 ||
    !Number.isSafeInteger(discount) ||
    discount < 0 ||
    discount >= total ||
    lines.some((n) => !Number.isSafeInteger(n) || n <= 0)
  )
    throw new Error("Invalid discount allocation");
  const allocated = lines.map((n) =>
    Number((BigInt(n) * BigInt(discount)) / BigInt(total)),
  );
  let left = discount - allocated.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0; i = (i + 1) % lines.length) {
    if (allocated[i] < lines[i]) {
      allocated[i]++;
      left--;
    }
  }
  return allocated;
}
