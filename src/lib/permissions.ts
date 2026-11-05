export const permissions = {
  owner: ["*"],
  manager: [
    "dashboard.read",
    "analytics.read",
    "inventory.manage",
    "catalog.write",
    "orders.read",
    "orders.fulfill",
    "promotions.write",
    "reviews.moderate",
    "returns.manage",
    "support.manage",
    "inventory.write",
    "media.write",
  ],
  support: [
    "dashboard.read",
    "orders.read",
    "returns.manage",
    "support.manage",
  ],
  warehouse: [
    "dashboard.read",
    "orders.read",
    "orders.fulfill",
    "inventory.write",
  ],
  finance: [
    "dashboard.read",
    "orders.read",
    "refunds.write",
    "refunds.confirm",
    "audit.read",
  ],
  customer: [],
} as const;
export function roleAllows(role: string, permission: string) {
  const allowed: readonly string[] =
    permissions[role as keyof typeof permissions] ?? [];
  return allowed.includes("*") || allowed.includes(permission);
}
