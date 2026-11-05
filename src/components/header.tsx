"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useCart } from "./cart-provider";
import { Icon } from "./icons";
export function Header({ live }: { live: boolean }) {
  const { items, currency, setCurrency, ready } = useCart(),
    [open, setOpen] = useState(false),
    path = usePathname();
  const count = items.reduce((n, i) => n + i.qty, 0);
  return (
    <>
      <div className="announcement">
        {live
          ? "Leron Urban Electronics · Thoughtfully selected technology"
          : "THE NEXT CHAPTER IN EVERYDAY TECH — EXPLORE OUR DRAFT COLLECTION"}
        <span>DESIGNED FOR LIFE IN MOTION ↗</span>
      </div>
      <header className="header">
        <div className="shell header-inner">
          <Link
            href="/"
            className="wordmark"
            aria-label="Leron Urban Electronics home"
          >
            LERON<span className="brand-dot">®</span>
            <small>URBAN ELECTRONICS</small>
          </Link>
          <nav
            aria-label="Main navigation"
            className={open ? "main-nav open" : "main-nav"}
          >
            <Link
              className={path === "/" ? "active" : ""}
              onClick={() => setOpen(false)}
              href="/#collection"
            >
              Shop all
            </Link>
            <Link
              onClick={() => setOpen(false)}
              href="/?category=Audio#collection"
            >
              Audio
            </Link>
            <Link
              onClick={() => setOpen(false)}
              href="/?category=Wearables#collection"
            >
              Wearables
            </Link>
            <Link onClick={() => setOpen(false)} href="/about">
              Our story
            </Link>
          </nav>
          <div className="header-actions">
            <label className="currency">
              <Icon name="globe" />
              <span className="sr-only">Display currency</span>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as "USD" | "KES")}
              >
                <option value="USD">USD</option>
                <option value="KES">KES</option>
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
