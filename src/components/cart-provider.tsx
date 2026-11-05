"use client";
import { site, storageKey } from "@/config/site";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Currency, ProductData } from "@/lib/catalog";
export type CartLine = { sku: string; qty: number };
const Context = createContext<{
  items: CartLine[];
  currency: Currency;
  ready: boolean;
  setCurrency: (c: Currency) => void;
  add: (sku: string, qty?: number) => void;
  update: (sku: string, qty: number) => void;
  clear: () => void;
  notice: string;
}>({
  items: [],
  currency: "USD",
  ready: false,
  setCurrency: () => {},
  add: () => {},
  update: () => {},
  clear: () => {},
  notice: "",
});
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]),
    [currency, setCurrency] = useState<Currency>(site.locale.defaultCurrency),
    [ready, setReady] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(storageKey("cart-v1")) ?? "null",
      );
      if (saved && Array.isArray(saved.items)) {
        const seen = new Set();
        setItems(
          saved.items
            .filter(
              (i: CartLine) =>
                typeof i.sku === "string" &&
                !seen.has(i.sku) &&
                !!seen.add(i.sku) &&
                Number.isInteger(i.qty) &&
                i.qty > 0 &&
                i.qty <= 10,
            )
            .slice(0, 20),
        );
        if (site.currencies.includes(saved.currency))
          setCurrency(saved.currency);
      }
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem(
          storageKey("cart-v1"),
          JSON.stringify({ items, currency }),
        );
      } catch {}
  }, [items, currency, ready]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 2500);
    return () => clearTimeout(timer);
  }, [notice]);
  function add(sku: string, qty = 1) {
    setItems((current) => {
      const found = current.find((i) => i.sku === sku);
      if (found)
        return current.map((i) =>
          i.sku === sku ? { ...i, qty: Math.min(10, i.qty + qty) } : i,
        );
      return current.length < 20
        ? [...current, { sku, qty: Math.min(10, qty) }]
        : current;
    });
    setNotice("Added to your bag");
  }
  function update(sku: string, qty: number) {
    setItems((current) =>
      qty <= 0
        ? current.filter((i) => i.sku !== sku)
        : current.map((i) =>
            i.sku === sku ? { ...i, qty: Math.min(10, Math.floor(qty)) } : i,
          ),
    );
  }
  return (
    <Context.Provider
      value={{
        items,
        currency,
        ready,
        setCurrency,
        add,
        update,
        clear: () => setItems([]),
        notice,
      }}
    >
      {children}
      <div
        className={notice ? "toast visible" : "toast"}
        role="status"
        aria-live="polite"
      >
        {notice}
      </div>
    </Context.Provider>
  );
}
export const useCart = () => useContext(Context);
export function resolveCart(items: CartLine[], products: ProductData[]) {
  return items.map((i) => ({
    item: i,
    product: products.find((p) => p.sku === i.sku),
  }));
}
