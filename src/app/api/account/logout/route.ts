import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { currentCustomer } from "@/lib/customer-auth";
import { CustomerSession } from "@/models/CustomerSession";
import { checkOrigin } from "@/lib/checkout-auth";
import { sessionCookies } from "@/config/site";
import { apiError } from "@/lib/http";
export async function POST(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    const user = await currentCustomer();
    if (user)
      await CustomerSession.updateOne(
        { _id: user.sessionId },
        { $set: { revokedAt: new Date() } },
      );
    (await cookies()).delete(sessionCookies.customer);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
