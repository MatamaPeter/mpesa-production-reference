import type { Metadata } from "next";
import { OrderStatus } from "@/components/order-status";
export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  return <OrderStatus orderId={(await params).orderId} />;
}
