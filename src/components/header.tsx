"use client";
import { site, storageKey } from "@/config/site";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useCart } from "./cart-provider";
import { Icon } from "./icons";
export function Header({
  live,
  mode = "preview",
}: {
  live: boolean;
  mode?: string;
}) {
  const { items, currency, setCurrency, ready } = useCart(),
    [open, setOpen] = useState(false),
    path = usePathname();
  const count = items.reduce((n, i) => n + i.qty, 0);
  return (
    <>
      <div className="announcement">
        {mode === "sandbox"
          ? "SANDBOX STORE — TEST ORDERS ONLY"
          : live
            ? `${site.brand.name} · ${site.copy.announcement}`
            : site.copy.previewAnnouncement}
        <span>{site.copy.announcementAside}</span>
      </div>
      <header className="header">
        <div className="shell header-inner">
          <Link
            href="/"
            className="wordmark"
            aria-label={`${site.brand.name} home`}
          >
            {site.brand.wordmark}
            <span className="brand-dot">{site.brand.mark}</span>
            <small>{site.brand.descriptor}</small>
          </Link>
          <nav
            aria-label="Main navigation"
            className={open ? "main-nav open" : "main-nav"}
          >
            {site.navigation.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={
                  link.href === "/#collection" && path === "/" ? "active" : ""
                }
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="header-actions">
            {site.features.accounts && (
              <Link
                href="/account"
                className="account-link"
                aria-label="Your account"
              >
                Account
              </Link>
            )}
            <label className="currency">
              <Icon name="globe" />
              <span className="sr-only">Display currency</span>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {site.currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <Link
              className="bag-link"
              href="/cart"
              aria-label={`Shopping bag, ${ready ? count : 0} items`}
            >
              <Icon name="bag" />
              <span className="bag-count">{ready ? count : 0}</span>
            </Link>
            <button
              className="icon-button mobile-menu"
              onClick={() => setOpen(!open)}
              aria-label="Toggle menu"
              aria-expanded={open}
            >
              <Icon name={open ? "close" : "menu"} />
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
