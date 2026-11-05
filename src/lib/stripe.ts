import "server-only";
import Stripe from "stripe";
export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Card payments are not configured");
  return new Stripe(key, { maxNetworkRetries: 2, timeout: 15000 });
}
