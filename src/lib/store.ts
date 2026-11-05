export const store = {
  name: "Leron Urban Electronics",
  shortName: "LERON",
  description:
    "Electronics for life in motion. Explore audio, wearables, cameras and workspace essentials from Leron Urban Electronics.",
};
export function commerceEnabled() {
  return process.env.COMMERCE_LIVE === "true";
}
