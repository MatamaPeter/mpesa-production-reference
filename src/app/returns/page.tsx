import type { Metadata } from "next";
import { ReturnsPortal } from "@/components/returns-portal";
export const metadata: Metadata = {
  title: "Returns & exchanges",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  return <ReturnsPortal initialOrderId={(await searchParams).orderId ?? ""} />;
}
