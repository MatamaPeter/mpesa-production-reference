import type { MetadataRoute } from "next";
export const dynamic = "force-dynamic";
export default function robots(): MetadataRoute.Robots {
  return {
    rules:
      process.env.COMMERCE_LIVE === "true" &&
      process.env.COMMERCE_STAGE === "live"
        ? {
            userAgent: "*",
            allow: "/",
            disallow: [
              "/admin",
              "/api/",
              "/checkout",
              "/cart",
              "/orders/",
              "/account/",
              "/saved",
              "/returns",
            ],
          }
        : { userAgent: "*", disallow: "/" },
  };
}
