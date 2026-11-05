import "server-only";
import type { ClientSession } from "mongoose";
import { TaxJob } from "@/models/TaxJob";
import { stripeClient } from "./stripe";
export async function queueTaxTransaction(
  order: { _id: unknown; taxCalculationId?: string },
  session: ClientSession,
) {
  if (order.taxCalculationId)
    await TaxJob.updateOne(
      { _id: `order:${order._id}` },
      {
        $setOnInsert: {
          orderId: order._id,
          calculationId: order.taxCalculationId,
          kind: "transaction",
          status: "queued",
          attempts: 0,
        },
      },
      { upsert: true, session },
    );
}
export async function processTaxJobs() {
  if (process.env.PAYMENT_WORKER_ENABLED !== "true")
    return { taxWorkerEnabled: false };
  let completed = 0;
  for (let i = 0; i < 2; i++) {
    const job = await TaxJob.findOneAndUpdate(
      {
        $or: [
          { status: "queued", nextAttemptAt: { $lte: new Date() } },
          { status: "sending", lockedUntil: { $lt: new Date() } },
        ],
      },
      {
        $set: {
          status: "sending",
          lockedUntil: new Date(Date.now() + 5 * 60000),
        },
        $inc: { attempts: 1 },
      },
      { sort: { createdAt: 1 }, returnDocument: "after" },
    );
    if (!job) break;
    if (job.attempts > 4) {
      await TaxJob.updateOne(
        { _id: job._id },
        { $set: { status: "review", lockedUntil: null } },
      );
      continue;
    }
    try {
      let id: string;
      if (job.kind === "transaction") {
        const result =
          await stripeClient().tax.transactions.createFromCalculation(
            {
              calculation: job.calculationId,
              reference: `order:${job.orderId}`,
            },
            { idempotencyKey: `tax-${job._id}` },
          );
        id = result.id;
      } else if (job.kind === "full_reversal") {
        const original = await TaxJob.findOne({
          _id: `order:${job.orderId}`,
          status: "completed",
        }).lean();
        if (!original?.providerId)
          throw new Error("Original tax posting is pending");
        const result = await stripeClient().tax.transactions.createReversal(
          {
            mode: "full",
            original_transaction: original.providerId,
            reference: `refund:${job.refundId}`,
          },
          { idempotencyKey: `tax-${job._id}` },
        );
        id = result.id;
      } else {
        await TaxJob.updateOne(
          { _id: job._id },
          { $set: { status: "review", lockedUntil: null } },
        );
        continue;
      }
      await TaxJob.updateOne(
        { _id: job._id, status: "sending" },
        { $set: { status: "completed", providerId: id, lockedUntil: null } },
      );
      completed++;
    } catch {
      await TaxJob.updateOne(
        { _id: job._id, status: "sending" },
        {
          $set: {
            status: job.attempts >= 4 ? "review" : "queued",
            nextAttemptAt: new Date(Date.now() + 5 * 60000),
            lockedUntil: null,
            note: "Verify provider tax records before retrying this operation",
          },
        },
      );
    }
  }
  return { taxWorkerEnabled: true, taxJobsCompleted: completed };
}
