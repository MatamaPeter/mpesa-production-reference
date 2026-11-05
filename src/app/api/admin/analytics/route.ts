import { NextResponse } from "next/server";
import { Order } from "@/models/Order";
import { ReturnRequest } from "@/models/ReturnRequest";
import { Review } from "@/models/Review";
import { SupportTicket } from "@/models/SupportTicket";
import { requirePermission } from "@/lib/admin";
import { apiError } from "@/lib/http";
export async function GET() {
  try {
    await requirePermission("analytics.read");
    const since = new Date(Date.now() - 30 * 86400000),
      [revenue, states, returns, reviews, tickets] = await Promise.all([
        Order.aggregate([
          { $match: { status: "paid", paidAt: { $gte: since } } },
          {
            $group: {
              _id: "$currency",
              orders: { $sum: 1 },
              grossPaidMinor: { $sum: "$totalPaidMinor" },
              refundsMinor: { $sum: { $ifNull: ["$refundedMinor", 0] } },
              pendingRefundMinor: {
                $sum: { $ifNull: ["$refundReservedMinor", 0] },
              },
            },
          },
        ]),
        Order.aggregate([
          { $match: { createdAt: { $gte: since } } },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
        ReturnRequest.countDocuments({
          status: { $nin: ["closed", "rejected"] },
        }),
        Review.countDocuments({ status: "pending" }),
        SupportTicket.countDocuments({ status: { $ne: "resolved" } }),
      ]);
    return NextResponse.json({
      windowDays: 30,
      revenueByCurrency: revenue,
      orderStates: states,
      queues: { returns, reviews, tickets },
      note: "Operational order totals, not audited accounts, settlement or tax reports. Currency totals are intentionally not combined.",
    });
  } catch (e) {
    return apiError(e);
  }
}
