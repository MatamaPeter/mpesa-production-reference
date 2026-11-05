import "server-only";
import { createHash } from "node:crypto";
import { site } from "@/config/site";
// Namespace persisted public caches by deployment data source and public pricing settings.
// The URI is hashed locally; connection strings and credentials are never cache labels or responses.
export const cacheScope = createHash("sha256")
  .update(
    JSON.stringify({
      database: process.env.MONGODB_URI ?? "preview",
      namespace: process.env.CACHE_NAMESPACE ?? site.id,
      currencies: site.currencies,
      fx: site.fx,
      locale: site.locale,
    }),
  )
  .digest("hex")
  .slice(0, 24);
export const catalogTag = `catalog:${cacheScope}`;
