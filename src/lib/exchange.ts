import { cacheScope } from "./cache-scope";
import "server-only";
import { unstable_cache } from "next/cache";
import { z } from "zod";
import { site } from "@/config/site";
import { FXSnapshot } from "@/models/FXSnapshot";
import { connectDB } from "./db";
import { convertMinor } from "./money";
export type ExchangeSnapshot = {
  timestamp: number;
  rates: Record<string, number>;
};
const load = unstable_cache(
  async (): Promise<ExchangeSnapshot | null> => {
    await connectDB();
    try {
      const key = process.env.FX_API_KEY;
      if (!key) throw new Error("FX provider not configured");
      const response = await fetch(
        `https://openexchangerates.org/api/latest.json?app_id=${encodeURIComponent(key)}`,
        { signal: AbortSignal.timeout(10000), cache: "no-store" },
      );
      if (!response.ok) throw new Error("FX provider unavailable");
      const parsed = z
        .object({
          base: z.literal("USD"),
          timestamp: z.number().int().positive(),
          rates: z.record(
            z.string().regex(/^[A-Z]{3}$/),
            z.number().positive().finite(),
          ),
        })
        .parse(await response.json());
      if (
        parsed.timestamp * 1000 > Date.now() + 120000 ||
        Date.now() - parsed.timestamp * 1000 > site.fx.maxAgeSeconds * 1000
      )
        throw new Error("FX snapshot is stale");
      const snapshot = {
        timestamp: parsed.timestamp,
        rates: { ...parsed.rates, USD: 1 },
      };
      await FXSnapshot.updateOne(
        { _id: String(snapshot.timestamp) },
        { $setOnInsert: snapshot },
        { upsert: true },
      );
      return snapshot;
    } catch {
      const row = await FXSnapshot.findOne({
        timestamp: {
          $gte: Math.floor(Date.now() / 1000) - site.fx.maxAgeSeconds,
        },
      })
        .sort({ timestamp: -1 })
        .lean();
      return row ? { timestamp: row.timestamp, rates: row.rates } : null;
    }
  },
  [cacheScope, "fx-v2"],
  { revalidate: 300 },
);
export async function exchangeSnapshot() {
  return site.fx.enabled ? load() : null;
}
export function unitPrice(
  prices: Record<string, number>,
  currency: string,
  snapshot: ExchangeSnapshot | null,
) {
  const fixed = prices[currency];
  if (Number.isSafeInteger(fixed) && fixed > 0) return fixed;
  const base = prices[site.fx.baseCurrency];
  if (
    !snapshot ||
    Date.now() - snapshot.timestamp * 1000 > site.fx.maxAgeSeconds * 1000
  )
    throw new Error(
      "No approved price or recent exchange rate is available for this currency",
    );
  let value = convertMinor(
    base,
    site.fx.baseCurrency,
    currency,
    snapshot.rates,
  );
  if (currency === "KES") value = Math.max(100, Math.round(value / 100) * 100);
  return value;
}

export async function refreshMarketPrices() {
  if (!site.fx.enabled) return { fxEnabled: false };
  const snapshot = await exchangeSnapshot();
  if (!snapshot) return { fxEnabled: true, fxAvailable: false };
  const { Product } = await import("@/models/Product");
  const rows = await Product.find({
    active: true,
    marketPriceTimestamp: { $ne: snapshot.timestamp },
  })
    .limit(100)
    .lean();
  const writes = rows.map((p) => {
    const prices: Record<string, number> = {};
    for (const currency of site.currencies)
      try {
        prices[currency] = unitPrice(p.prices, currency, snapshot);
      } catch {}
    return {
      updateOne: {
        filter: { _id: p._id, updatedAt: p.updatedAt },
        update: {
          $set: {
            marketPrices: prices,
            marketPriceTimestamp: snapshot.timestamp,
          },
        },
      },
    };
  });
  if (writes.length) await Product.bulkWrite(writes, { timestamps: false });
  return { fxEnabled: true, fxAvailable: true, pricesUpdated: rows.length };
}
