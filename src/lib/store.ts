import { site } from "@/config/site";
export const store = {
  name: site.brand.name,
  shortName: site.brand.wordmark,
  description: site.brand.description,
};
export function commerceEnabled() {
  return process.env.COMMERCE_LIVE === "true";
}
