import type { Metadata } from "next";
import { AccountPanel } from "@/components/account-panel";
export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <AccountPanel />;
}
