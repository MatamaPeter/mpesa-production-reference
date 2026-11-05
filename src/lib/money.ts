export function currencyDigits(currency: string) {
  const digits = new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).resolvedOptions().maximumFractionDigits;
  return digits ?? 2;
}
export function decimalToMinor(value: string, currency: string) {
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error("Invalid money amount");
  const [whole, fraction = ""] = value.split("."),
    digits = currencyDigits(currency);
  if (fraction.length > digits && /[1-9]/.test(fraction.slice(digits)))
    throw new Error("Amount has excessive precision");
  const amount = Number(
    BigInt(whole) * 10n ** BigInt(digits) +
      BigInt((fraction + "0".repeat(digits)).slice(0, digits) || "0"),
  );
  if (!Number.isSafeInteger(amount))
    throw new Error("Amount exceeds supported precision");
  return amount;
}
export function convertMinor(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>,
) {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new Error("Invalid amount");
  const a = rates[from],
    b = rates[to];
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0)
    throw new Error("Currency conversion unavailable");
  const numerator =
      BigInt(amount) *
      BigInt(Math.round(b * 1e8)) *
      10n ** BigInt(currencyDigits(to)),
    denominator =
      BigInt(Math.round(a * 1e8)) * 10n ** BigInt(currencyDigits(from));
  if (denominator <= 0) throw new Error("Unsupported exchange rate");
  const result = Number((numerator + denominator / 2n) / denominator);
  if (!Number.isSafeInteger(result) || result <= 0)
    throw new Error("Converted amount is out of range");
  return result;
}

export function minorToDecimal(value: number, currency: string) {
  if (!Number.isSafeInteger(value)) return "";
  const digits = currencyDigits(currency),
    negative = value < 0,
    n = BigInt(Math.abs(value)),
    factor = 10n ** BigInt(digits);
  return `${negative ? "-" : ""}${n / factor}${digits ? "." + (n % factor).toString().padStart(digits, "0") : ""}`;
}
export function validGTIN(value: string) {
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return false;
  let sum = 0;
  for (let i = value.length - 2, position = 0; i >= 0; i--, position++)
    sum += Number(value[i]) * (position % 2 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(value.at(-1));
}
