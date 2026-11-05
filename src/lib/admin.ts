import "server-only";
import { cookies } from "next/headers";
import { validAdminSession } from "./admin-crypto";
import { RequestError } from "./http";
export async function isAdmin() {
  const secret = process.env.ADMIN_SESSION_SECRET,
    hash = process.env.ADMIN_PASSWORD_HASH;
  if (!secret || secret.length < 32 || !hash) return false;
  return validAdminSession(
    (await cookies()).get("leron_admin")?.value ?? "",
    secret,
    hash,
  );
}
export async function requireAdmin() {
  if (!(await isAdmin()))
    throw new RequestError("Administrator sign-in required", 401);
}
