import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules:
      process.env.COMMERCE_LIVE === "true"
        ? {
            userAgent: "*",
            allow: "/",
            disallow: ["/admin", "/api/", "/checkout", "/cart", "/orders/"],
          }
        : { userAgent: "*", disallow: "/" },
  };
}
