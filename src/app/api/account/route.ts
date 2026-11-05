import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { requireCustomer, currentCustomer } from "@/lib/customer-auth";
import { Customer } from "@/models/Customer";
import { CustomerSession } from "@/models/CustomerSession";
import { Order } from "@/models/Order";
import { checkOrigin } from "@/lib/checkout-auth";
import { addressSchema } from "@/lib/commerce";
import { apiError, readJSON, RequestError } from "@/lib/http";
import { sessionCookies } from "@/config/site";
export async function GET() {
  try {
    const user = await currentCustomer();
    if (!user) return NextResponse.json({ user: null });
    const record = await Customer.findById(user.id)
      .select("wishlist totpSecret +totpSecret")
      .lean();
    const orders = await Order.find({ customerId: user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .select(
        "currency amountMinor totalPaidMinor status fulfillment createdAt",
      )
      .lean();
    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          addresses: user.addresses,
          mfaEnabled: !!record?.totpSecret,
          mfaVerified:
            !!user.mfaAt &&
            Date.now() - new Date(user.mfaAt).getTime() < 8 * 3600000,
        },
        wishlist: record?.wishlist ?? [],
        orders,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    const user = await requireCustomer();
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(100),
        addresses: z
          .array(
            addressSchema
              .omit({ email: true })
              .extend({ label: z.string().max(50).default("Address") }),
          )
          .max(10),
      })
      .strict()
      .safeParse(await readJSON(req));
    if (!parsed.success) throw new RequestError("Check your profile details");
    await Customer.updateOne({ _id: user.id }, { $set: parsed.data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    const user = await requireCustomer();
    await CustomerSession.updateMany(
      { customerId: user.id, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    (await cookies()).delete(sessionCookies.customer);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
