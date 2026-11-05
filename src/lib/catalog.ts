import { currencyDigits } from "./money";
import { site } from "@/config/site";
export const currencies = site.currencies;
export type Currency = (typeof currencies)[number];
export type ProductData = {
  brand?: string;
  gtin?: string;
  mpn?: string;
  condition?: string;
  parentSku?: string;
  attributes?: { name: string; value: string }[];
  specifications?: { name: string; value: string }[];
  images?: string[];
  tags?: string[];
  taxCode?: string;
  weightGrams?: number;
  sku: string;
  slug: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  prices: Record<Currency, number>;
  image: string;
  features: string[];
  stock: number;
  active: boolean;
  featured: boolean;
};
// Editorial drafts, not claims about actual manufacturers or inventory.
export const draftProducts: ProductData[] = [
  {
    sku: "lu-headphones",
    slug: "studio-wireless-headphones",
    name: "Studio Wireless",
    category: "Audio",
    tagline: "Your world. On mute.",
    description:
      "A wireless headphone concept for the launch collection. Final manufacturer, specifications, warranty and availability will be confirmed before sale.",
    prices: { USD: 12900, KES: 1690000 },
    image: "headphones",
    features: [
      "Over-ear design",
      "Wireless listening",
      "Travel-ready silhouette",
    ],
    stock: 0,
    active: true,
    featured: true,
  },
  {
    sku: "lu-speaker",
    slug: "pulse-portable-speaker",
    name: "Pulse Mini",
    category: "Audio",
    tagline: "Small speaker. Big energy.",
    description:
      "A compact speaker concept for music at home and on the move. Technical specifications and availability are awaiting approval.",
    prices: { USD: 5900, KES: 790000 },
    image: "speaker",
    features: ["Compact form", "Portable design", "Everyday audio"],
    stock: 0,
    active: true,
    featured: true,
  },
  {
    sku: "lu-watch",
    slug: "orbit-smart-watch",
    name: "Orbit Watch",
    category: "Wearables",
    tagline: "Stay in your rhythm.",
    description:
      "A wearable concept with a clean, everyday profile. This draft makes no medical, fitness accuracy or battery-life claims. Specifications will be published before sale.",
    prices: { USD: 8900, KES: 1190000 },
    image: "watch",
    features: ["Everyday styling", "Adjustable strap", "Clear display design"],
    stock: 0,
    active: true,
    featured: true,
  },
  {
    sku: "lu-camera",
    slug: "frame-digital-camera",
    name: "Frame Camera",
    category: "Cameras",
    tagline: "Make the everyday cinematic.",
    description:
      "A camera concept for moments worth keeping. Sensor, lens, video capabilities and included accessories will be confirmed with the final product.",
    prices: { USD: 34900, KES: 4590000 },
    image: "camera",
    features: ["Compact body", "Creative controls", "Everyday carry"],
    stock: 0,
    active: true,
    featured: true,
  },
  {
    sku: "lu-charger",
    slug: "flow-desktop-charger",
    name: "Flow Charger",
    category: "Accessories",
    tagline: "A little less cable chaos.",
    description:
      "A desktop charging concept. Supported devices, electrical safety certification and power output must be verified before sale.",
    prices: { USD: 3900, KES: 520000 },
    image: "charger",
    features: [
      "Desk-friendly design",
      "Compact footprint",
      "Minimal silhouette",
    ],
    stock: 0,
    active: true,
    featured: false,
  },
  {
    sku: "lu-keyboard",
    slug: "type-wireless-keyboard",
    name: "Type Keyboard",
    category: "Computing",
    tagline: "Find your flow state.",
    description:
      "A wireless keyboard concept for a considered workspace. Layout, connectivity, compatibility and final specifications are awaiting approval.",
    prices: { USD: 7900, KES: 1050000 },
    image: "keyboard",
    features: ["Low-profile shape", "Compact layout", "Workspace essential"],
    stock: 0,
    active: true,
    featured: false,
  },
];
export function formatMoney(
  minor: number,
  currency: Currency = site.locale.defaultCurrency,
) {
  if (!Number.isSafeInteger(minor)) return "Unavailable";
  return new Intl.NumberFormat(site.locale.formatting, {
    style: "currency",
    currency,
    maximumFractionDigits:
      minor % 10 ** currencyDigits(currency) === 0
        ? 0
        : currencyDigits(currency),
  }).format(minor / 100);
}
export const categories = ["All", ...site.categories];

const illustrationNames = new Set([
  "headphones",
  "speaker",
  "watch",
  "camera",
  "charger",
  "keyboard",
]);
export function validProductImage(value: string) {
  return (
    /^\/api\/media\/[a-f0-9]{32}$/.test(value) ||
    illustrationNames.has(value) ||
    /^\/products\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.(?:png|jpe?g|webp|avif)$/i.test(
      value,
    )
  );
}
export function productImage(value: string) {
  return validProductImage(value)
    ? value.startsWith("/")
      ? value
      : `/products/${value}.svg`
    : "/products/headphones.svg";
}
