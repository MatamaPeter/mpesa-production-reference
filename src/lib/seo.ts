import "server-only";
import { site } from "@/config/site";
import { currencyDigits } from "./money";
export function publicOrigin() {
  try {
    const url = new URL(process.env.APP_ORIGIN ?? "");
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.origin
      : null;
  } catch {
    return null;
  }
}
export function moneyDecimal(value: number, currency: string) {
  const digits = currencyDigits(currency),
    negative = value < 0,
    n = BigInt(Math.abs(value)),
    factor = 10n ** BigInt(digits);
  return `${negative ? "-" : ""}${n / factor}${digits ? "." + (n % factor).toString().padStart(digits, "0") : ""}`;
}
export function xml(value: unknown) {
  return String(value).replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
}
export function indexingEnabled() {
  return (
    process.env.COMMERCE_LIVE === "true" &&
    process.env.COMMERCE_STAGE === "live" &&
    site.policy.approved
  );
}
