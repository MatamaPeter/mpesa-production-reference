import type { Metadata } from "next";
import { getProducts } from "@/lib/products";
import { commerceEnabled } from "@/lib/store";
import { Checkout } from "@/components/checkout";
export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function Page() {
  let countries: string[] = [];
  try {
    countries = Object.keys(
      JSON.parse(process.env.SHIPPING_RATES_JSON ?? "{}"),
    ).filter((c) => /^[A-Z]{2}$/.test(c));
  } catch {}
  return (
    <Checkout
      products={await getProducts()}
      live={commerceEnabled() && process.env.TAX_POLICY_APPROVED === "true"}
      countries={countries}
      cardEnabled={
        !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET
      }
      mpesaEnabled={
        !!process.env.MPESA_CONSUMER_KEY &&
        !!process.env.MPESA_CONSUMER_SECRET &&
        process.env.MPESA_TAX_APPROVED === "true"
      }
    />
  );
}
