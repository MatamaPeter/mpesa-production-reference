"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { site, storageKey } from "@/config/site";
type Saved = {
  wishlist: string[];
  comparison: string[];
  recent: string[];
  toggleWish: (sku: string) => void;
  toggleCompare: (sku: string) => void;
  viewed: (sku: string) => void;
  ready: boolean;
  message: string;
};
const Context = createContext<Saved>({
  wishlist: [],
  comparison: [],
  recent: [],
  toggleWish: () => {},
  toggleCompare: () => {},
  viewed: () => {},
  ready: false,
  message: "",
});
export function SavedProvider({ children }: { children: ReactNode }) {
  const [wishlist, setWishlist] = useState<string[]>([]),
    [comparison, setComparison] = useState<string[]>([]),
    [recent, setRecent] = useState<string[]>([]),
    [ready, setReady] = useState(false),
    [signedIn, setSignedIn] = useState(false),
    [message, setMessage] = useState("");
  const guestWishlist = useRef<string[]>([]);
  function parse(value: unknown, max: number) {
    return Array.isArray(value)
      ? [
          ...new Set(
            value.filter(
              (s: unknown): s is string =>
                typeof s === "string" && /^[a-z0-9-]{1,80}$/.test(s),
            ),
          ),
        ].slice(0, max)
      : [];
  }
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(storageKey("saved-v1")) ?? "{}",
      );
      guestWishlist.current = parse(saved.wishlist, 100);
      setWishlist(guestWishlist.current);
      setComparison(parse(saved.comparison, 4));
      setRecent(parse(saved.recent, 12));
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem(
          storageKey("saved-v1"),
          JSON.stringify({
            wishlist: signedIn ? guestWishlist.current : wishlist,
            comparison,
            recent,
          }),
        );
      } catch {}
  }, [ready, wishlist, comparison, recent, signedIn]);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    async function sync() {
      try {
        const r = await fetch("/api/account/wishlist", { cache: "no-store" });
        if (!active) return;
        if (!r.ok) {
          if (r.status === 401) {
            setSignedIn(false);
            setWishlist(guestWishlist.current);
          }
          return;
        }
        const data = await r.json();
        setSignedIn(true);
        setWishlist(parse(data.items, 100));
      } catch {}
    }
    void sync();
    window.addEventListener("account-changed", sync);
    return () => {
      active = false;
      window.removeEventListener("account-changed", sync);
    };
  }, [ready]);
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(""), 3500);
    return () => clearTimeout(id);
  }, [message]);
  function toggleWish(sku: string) {
    const removing = wishlist.includes(sku);
    if (!removing && wishlist.length >= 100) {
      setMessage("Your wishlist can hold up to 100 products");
      return;
    }
    const next = removing
      ? wishlist.filter((s) => s !== sku)
      : [...wishlist, sku];
    if (!signedIn) guestWishlist.current = next;
    setWishlist(next);
    if (signedIn)
      void fetch("/api/account/wishlist", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sku, action: removing ? "remove" : "add" }),
      })
        .then((r) => {
          if (!r.ok)
            setMessage(
              "Saved in this browser. Account sync is temporarily unavailable.",
            );
        })
        .catch(() =>
          setMessage(
            "Saved in this browser. Account sync is temporarily unavailable.",
          ),
        );
  }
  function toggleCompare(sku: string) {
    if (!comparison.includes(sku) && comparison.length >= 4) {
      setMessage("Compare up to four products at a time");
      return;
    }
    setComparison((list) =>
      list.includes(sku) ? list.filter((s) => s !== sku) : [...list, sku],
    );
  }
  function viewed(sku: string) {
    setRecent((list) => [sku, ...list.filter((s) => s !== sku)].slice(0, 12));
  }
  return (
    <Context.Provider
      value={{
        wishlist,
        comparison,
        recent,
        toggleWish,
        toggleCompare,
        viewed,
        ready,
        message,
      }}
    >
      {children}
      {message && (
        <div className="toast visible" role="status">
          {message}
        </div>
      )}
    </Context.Provider>
  );
}
export const useSaved = () => useContext(Context);
export function SaveButtons({ sku }: { sku: string }) {
  const { wishlist, comparison, toggleWish, toggleCompare, ready } = useSaved();
  if (!site.features.wishlist && !site.features.comparison) return null;
  return (
    <div className="save-buttons">
      <button
        type="button"
        disabled={!ready}
        aria-pressed={wishlist.includes(sku)}
        onClick={() => toggleWish(sku)}
      >
        {wishlist.includes(sku) ? "♥ Saved" : "♡ Save"}
      </button>
      <button
        type="button"
        disabled={!ready}
        aria-pressed={comparison.includes(sku)}
        onClick={() => toggleCompare(sku)}
      >
        {comparison.includes(sku) ? "✓ Comparing" : "⇄ Compare"}
      </button>
    </div>
  );
}
