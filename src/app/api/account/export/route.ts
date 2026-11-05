import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/customer-auth";
import { Order } from "@/models/Order";
import { apiError } from "@/lib/http";
export async function GET() {
  try {
    const user = await requireCustomer();
    const orders = await Order.find({ customerId: user.id })
      .select(
        "items currency amountMinor totalPaidMinor address status fulfillment createdAt",
      )
      .lean();
    return NextResponse.json(
      {
        profile: {
          name: user.name,
          email: user.email,
          addresses: user.addresses,
        },
        orders,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": "attachment; filename=account-data.json",
        },
      },
    );
  } catch (e) {
    return apiError(e);
  }
}
