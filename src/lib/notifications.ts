import "server-only";
import type { ClientSession } from "mongoose";
import { EmailOutbox } from "@/models/EmailOutbox";
import { formatMoney, type Currency } from "./catalog";
interface NotificationOrder {
  _id: unknown;
  address?: { email?: string; name?: string };
  currency: Currency;
  amountMinor: number;
  totalPaidMinor?: number;
  items: { name: string; qty: number }[];
  fulfillment: string;
  trackingNumber?: string;
}
export async function queueNotification(
  order: NotificationOrder,
  kind: "receipt" | "fulfillment",
  session: ClientSession,
) {
  if (!order.address?.email) return;
  const id = String(order._id),
    eventKey = `order:${id}:${kind === "receipt" ? "receipt" : order.fulfillment}`;
  const subject =
    kind === "receipt"
      ? "Your Leron order is confirmed"
      : `Your Leron order: ${order.fulfillment}`;
  const text = [
    `Hello ${order.address.name ?? "there"},`,
    "",
    kind === "receipt"
      ? "Your payment has been confirmed. Thank you for shopping with Leron Urban Electronics."
      : `Your order is now ${order.fulfillment}.`,
    `Order reference: ${id}`,
    ...order.items.map((i) => `${i.name} × ${i.qty}`),
    ...(kind === "receipt"
      ? [
          `Total paid: ${formatMoney(order.totalPaidMinor ?? order.amountMinor, order.currency)}`,
        ]
      : []),
    ...(order.trackingNumber
      ? [`Tracking reference: ${order.trackingNumber}`]
      : []),
    "",
    "Keep your original browser session to view the order. This email does not grant access to order details.",
  ].join("\n");
  await EmailOutbox.updateOne(
    { eventKey },
    {
      $setOnInsert: {
        eventKey,
        to: order.address.email,
        subject,
        text,
        status: "pending",
        attempts: 0,
        nextAttemptAt: new Date(),
      },
    },
    { upsert: true, session },
  );
}
export async function deliverNotifications() {
  const key = process.env.RESEND_API_KEY,
    from = process.env.EMAIL_FROM;
  if (!key || !from) return { emailConfigured: false, emailSent: 0 };
  let sent = 0,
    review = 0;
  for (let i = 0; i < 2; i++) {
    const now = new Date(),
      row = await EmailOutbox.findOneAndUpdate(
        {
          $or: [
            { status: "pending", nextAttemptAt: { $lte: now } },
            { status: "sending", lockedUntil: { $lt: now } },
          ],
        },
        {
          $set: {
            status: "sending",
            lockedUntil: new Date(Date.now() + 5 * 60000),
          },
          $inc: { attempts: 1 },
        },
        { returnDocument: "after", sort: { createdAt: 1 } },
      );
    if (!row) break;
    // Provider idempotency expires: never blindly resend old uncertain deliveries.
    if (
      row.attempts > 8 ||
      Date.now() - new Date(row.createdAt).getTime() > 23 * 3600000
    ) {
      await EmailOutbox.updateOne(
        { _id: row._id, status: "sending" },
        { $set: { status: "review", lockedUntil: null } },
      );
      review++;
      continue;
    }
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": row.eventKey,
        },
        body: JSON.stringify({
          from,
          to: [row.to],
          subject: row.subject,
          text: row.text,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        if (
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 429
        ) {
          await EmailOutbox.updateOne(
            { _id: row._id, status: "sending" },
            { $set: { status: "review", lockedUntil: null } },
          );
          review++;
          continue;
        }
        throw new Error("Delivery temporarily unavailable");
      }
      const data = (await response.json()) as { id?: string };
      if (!data.id) throw new Error("Delivery outcome uncertain");
      await EmailOutbox.updateOne(
        { _id: row._id, status: "sending" },
        {
          $set: {
            status: "sent",
            providerId: data.id,
            sentAt: new Date(),
            lockedUntil: null,
          },
        },
      );
      sent++;
    } catch {
      await EmailOutbox.updateOne(
        { _id: row._id, status: "sending" },
        {
          $set: {
            status: "pending",
            lockedUntil: null,
            nextAttemptAt: new Date(
              Date.now() + 60000 * 2 ** Math.min(row.attempts, 8),
            ),
          },
        },
      );
    }
  }
  return { emailConfigured: true, emailSent: sent, emailReview: review };
}
