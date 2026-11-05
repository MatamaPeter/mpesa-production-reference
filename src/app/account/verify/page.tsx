import type { Metadata } from "next";
import { VerifyAccount } from "@/components/verify-account";
export const metadata: Metadata = {
  title: "Confirm sign-in",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <VerifyAccount token={token ?? ""} />;
}
