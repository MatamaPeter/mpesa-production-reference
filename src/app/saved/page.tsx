import type { Metadata } from "next";
import { getProducts } from "@/lib/products";
import { SavedProducts } from "@/components/saved-products";
export const metadata: Metadata = { title: "Saved & compared products" };
export const dynamic = "force-dynamic";
export default async function Page() {
  return <SavedProducts products={await getProducts()} />;
}
