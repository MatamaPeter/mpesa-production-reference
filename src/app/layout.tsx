import { site, storageKey } from "@/config/site";
import { headers } from "next/headers";
import { themeVariables } from "@/config/site";
import type { CSSProperties, ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { SavedProvider } from "@/components/saved-provider";
import { CartProvider } from "@/components/cart-provider";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { store, commerceEnabled } from "@/lib/store";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: `${site.brand.name} — ${site.brand.tagline}`,
    template: `%s | ${site.brand.name}`,
  },
  description: store.description,
  robots:
    process.env.COMMERCE_LIVE === "true"
      ? { index: true, follow: true }
      : { index: false, follow: false },
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = { themeColor: site.theme.primary };
export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  await headers();
  return (
    <html lang={site.locale.language} style={themeVariables as CSSProperties}>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <CartProvider>
          <SavedProvider>
            <Header
              live={commerceEnabled()}
              mode={process.env.COMMERCE_STAGE ?? "preview"}
            />
            {children}
            <Footer />
          </SavedProvider>
        </CartProvider>
      </body>
    </html>
  );
}
