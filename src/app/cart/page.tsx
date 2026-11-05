import type { Metadata } from "next";
import { getProducts } from "@/lib/products";
import { Bag } from "@/components/bag";
import { commerceEnabled } from "@/lib/store";
export const metadata: Metadata = { title: "Your bag" };
export const dynamic = "force-dynamic";
export default async function Page() {
  return <Bag products={await getProducts()} live={commerceEnabled()} />;
}
