import { site } from "@/config/site";
type ClientRequirements = {
  contact: { email: string; phone: string; address: string; legalName: string };
  policy: {
    approved: boolean;
    shipping: string;
    returns: string;
    privacy: string;
    terms: string;
  };
  features: { accounts: boolean };
  currencies: readonly string[];
  fx: { enabled: boolean };
};
export function deploymentIssues(
  env: Record<string, string | undefined>,
  config: ClientRequirements = site,
) {
  const issues: string[] = [];
  const stage = env.COMMERCE_STAGE ?? "preview";
  if (!["preview", "sandbox", "live"].includes(stage))
    issues.push("COMMERCE_STAGE must be preview, sandbox or live");
  if (env.COMMERCE_LIVE !== "true") return issues;
  if (stage === "preview")
    issues.push("Select sandbox or live explicitly before enabling checkout");
  if (stage === "sandbox") {
    if (env.STRIPE_SECRET_KEY && !env.STRIPE_SECRET_KEY.startsWith("sk_test_"))
      issues.push("Sandbox requires Stripe test credentials");
    if (env.MPESA_ENV === "production")
      issues.push("Sandbox cannot use the M-Pesa production API");
    if (
      env.SHIPPING_LABEL_PURCHASE_ENABLED === "true" &&
      !env.SHIPPO_API_TOKEN?.startsWith("shippo_test_")
    )
      issues.push("Sandbox label purchases require Shippo test credentials");
    return issues;
  }
  if (stage !== "live") return issues;
  if (
    !env.APP_ORIGIN ||
    !/^https:\/\/[^/]+$/.test(env.APP_ORIGIN) ||
    /localhost|127\.0\.0\.1/.test(env.APP_ORIGIN)
  )
    issues.push("APP_ORIGIN must be the exact public HTTPS origin");
  for (const name of ["CHECKOUT_COOKIE_SECRET", "CRON_SECRET"]) {
    if (!env[name] || env[name]!.length < 32)
      issues.push(`${name} needs at least 32 random characters`);
  }
  if (
    env.CHECKOUT_COOKIE_SECRET &&
    env.CHECKOUT_COOKIE_SECRET === env.CRON_SECRET
  )
    issues.push("Session and worker secrets must be independent");
  if (
    !env.MONGODB_URI ||
    (!env.MONGODB_URI.startsWith("mongodb+srv://") &&
      !/[?&](tls|ssl)=true(?:&|$)/i.test(env.MONGODB_URI))
  )
    issues.push("Live MongoDB must use TLS");
  if (env.ADMIN_BOOTSTRAP_ENABLED === "true")
    issues.push("Disable bootstrap administrator access before launch");
  if (!/^[a-f0-9]{64}$/i.test(env.AUTH_ENCRYPTION_KEY ?? ""))
    issues.push(
      "AUTH_ENCRYPTION_KEY must be 32 random bytes encoded as hexadecimal",
    );
  if (
    config.features.accounts &&
    (env.ACCOUNT_AUTH_ENABLED !== "true" ||
      !env.RESEND_API_KEY ||
      !env.EMAIL_FROM)
  )
    issues.push("Configure and test account authentication email");
  if (
    !config.contact.legalName ||
    !config.contact.address ||
    !config.contact.email ||
    !config.contact.phone
  )
    issues.push(
      "Complete the merchant legal identity, address and support contact details",
    );
  if (
    !config.policy.approved ||
    [
      config.policy.shipping,
      config.policy.returns,
      config.policy.privacy,
      config.policy.terms,
    ].some((p) => p.trim().length < 100)
  )
    issues.push(
      "Publish approved shipping, returns, privacy and sale policies",
    );
  if (!env.SHIPPING_RATES_JSON)
    issues.push("Configure approved shipping destinations and rates");
  else
    try {
      const rates = JSON.parse(env.SHIPPING_RATES_JSON);
      if (
        !Object.keys(rates).length ||
        Object.entries(rates).some(
          ([country, value]) =>
            !/^[A-Z]{2}$/.test(country) ||
            typeof value !== "object" ||
            !value ||
            Object.entries(value).some(
              ([currency, amount]) =>
                !config.currencies.includes(currency) ||
                !Number.isSafeInteger(amount) ||
                Number(amount) < 0,
            ),
        )
      )
        issues.push(
          "Shipping rates contain unsupported destinations, currencies or amounts",
        );
    } catch {
      issues.push("SHIPPING_RATES_JSON is invalid");
    }
  if (env.TAX_POLICY_APPROVED !== "true")
    issues.push("Approve the merchant tax setup");
  if (
    !env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ||
    !env.STRIPE_WEBHOOK_SECRET
  )
    issues.push("Configure and verify live card payments and signed webhooks");
  if (
    env.MPESA_TAX_APPROVED === "true" &&
    (env.MPESA_ENV !== "production" ||
      [
        "MPESA_CONSUMER_KEY",
        "MPESA_CONSUMER_SECRET",
        "MPESA_SHORTCODE",
        "MPESA_PASSKEY",
        "MPESA_CALLBACK_TOKEN",
        "MPESA_CALLBACK_URL",
      ].some((k) => !env[k]))
  )
    issues.push("Complete and verify production M-Pesa settings");
  if (config.fx.enabled && !env.FX_API_KEY)
    issues.push("Configure the enabled exchange-rate provider");
  if (env.PAYMENT_WORKER_ENABLED !== "true")
    issues.push("Enable the tested financial background worker");
  return issues;
}
