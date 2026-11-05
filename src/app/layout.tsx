import { headers } from "next/headers";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { CartProvider } from "@/components/cart-provider";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { store, commerceEnabled } from "@/lib/store";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Leron Urban Electronics — Tech for life in motion",
    template: "%s | Leron Urban Electronics",
  },
  description: store.description,
  robots:
    process.env.COMMERCE_LIVE === "true"
      ? { index: true, follow: true }
      : { index: false, follow: false },
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = { themeColor: "#142821" };
export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  await headers();
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <CartProvider>
          <Header live={commerceEnabled()} />
          {children}
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
