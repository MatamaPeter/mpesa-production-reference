import type { Metadata } from "next";
import { isAdmin } from "@/lib/admin";
import { AdminPanel } from "@/components/admin-panel";
export const metadata: Metadata = {
  title: "Store administration",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function Page() {
  return <AdminPanel authenticated={await isAdmin()} />;
}
