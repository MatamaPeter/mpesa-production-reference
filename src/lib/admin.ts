import "server-only";
import { connectDB } from "./db";
import { cookies } from "next/headers";
import { sessionCookies } from "@/config/site";
import { validAdminSession } from "./admin-crypto";
import { currentCustomer, roleAllows } from "./customer-auth";
import { RequestError } from "./http";
export async function adminPrincipal() {
  const user = await currentCustomer();
  if (
    user &&
    roleAllows(user.role, "dashboard.read") &&
    user.mfaAt &&
    Date.now() - new Date(user.mfaAt).getTime() < 8 * 3600000
  )
    return { id: user.id, role: user.role, legacy: false, mfaAt: user.mfaAt };
  if (process.env.ADMIN_BOOTSTRAP_ENABLED !== "true") return null;
  const secret = process.env.ADMIN_SESSION_SECRET,
    hash = process.env.ADMIN_PASSWORD_HASH;
  if (!secret || secret.length < 32 || !hash) return null;
  if (
    validAdminSession(
      (await cookies()).get(sessionCookies.admin)?.value ?? "",
      secret,
      hash,
    )
  )
    return { id: "bootstrap", role: "owner", legacy: true, mfaAt: new Date() };
  return null;
}
export async function isAdmin() {
  return !!(await adminPrincipal());
}
export async function requirePermission(permission: string) {
  const actor = await adminPrincipal();
  if (!actor)
    throw new RequestError(
      "Staff sign-in and authenticator verification are required",
      401,
    );
  if (!roleAllows(actor.role, permission))
    throw new RequestError("Your role does not permit this action", 403);
  await connectDB();
  return actor;
}
export async function requireAdmin() {
  return requirePermission("dashboard.read");
}
