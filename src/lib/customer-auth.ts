import "server-only";
import { cookies } from "next/headers";
import { Customer } from "@/models/Customer";
import { CustomerSession } from "@/models/CustomerSession";
import { connectDB } from "./db";
import { digest } from "./security";
import { RequestError } from "./http";
import { sessionCookies, site } from "@/config/site";
import { checkoutIdentity } from "./checkout-auth";
export async function currentCustomer() {
  if (!site.features.accounts) return null;
  const token = (await cookies()).get(sessionCookies.customer)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  await connectDB();
  const session = await CustomerSession.findOne({
    _id: digest(token),
    expiresAt: { $gt: new Date() },
    revokedAt: null,
  }).lean();
  if (!session) return null;
  const user = await Customer.findOne({
    _id: session.customerId,
    disabled: false,
  }).lean();
  if (!user || !user.verifiedAt) return null;
  return {
    id: String(user._id),
    email: user.email as string,
    name: user.name as string,
    role: user.role as string,
    addresses: user.addresses,
    sessionId: session._id as string,
    mfaAt: session.mfaAt as Date | undefined,
  };
}
export async function requireCustomer() {
  const user = await currentCustomer();
  if (!user) throw new RequestError("Sign in to continue", 401);
  return user;
}
export async function orderAccess() {
  const user = await currentCustomer(),
    guest = await checkoutIdentity();
  if (!user && !guest) return null;
  return {
    $or: [
      ...(user ? [{ customerId: user.id }] : []),
      ...(guest ? [{ ownerTokenHash: guest }] : []),
    ],
  };
}
export { permissions, roleAllows } from "./permissions";
