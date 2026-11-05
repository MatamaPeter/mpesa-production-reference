import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { Customer } from "@/models/Customer";
import { WorkerHeartbeat } from "@/models/WorkerHeartbeat";
import { EmailOutbox } from "@/models/EmailOutbox";
import { Refund } from "@/models/Refund";
import { requirePermission } from "@/lib/admin";
import { deploymentIssues } from "@/lib/deployment";
import { apiError } from "@/lib/http";
export async function GET() {
  try {
    await requirePermission("audit.read");
    const issues = deploymentIssues({
        ...process.env,
        COMMERCE_LIVE: "true",
        COMMERCE_STAGE: "live",
      }),
      hello = await mongoose.connection.db!.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== "isdbgrid")
      issues.push("MongoDB transaction topology is not supported");
    if (
      !(await Customer.exists({
        role: "owner",
        disabled: false,
        verifiedAt: { $ne: null },
        totpSecret: { $exists: true },
      }))
    )
      issues.push(
        "A verified owner with an enrolled authenticator is required",
      );
    const worker = await WorkerHeartbeat.findById("reconcile").lean();
    if (!worker || Date.now() - new Date(worker.lastRunAt).getTime() > 120000)
      issues.push("Background worker heartbeat is missing or stale");
    const [emailReview, refundReview] = await Promise.all([
      EmailOutbox.countDocuments({ status: "review" }),
      Refund.countDocuments({ status: "review" }),
    ]);
    return NextResponse.json({
      configurationPassed: issues.length === 0,
      issues,
      workerLastRunAt: worker?.lastRunAt ?? null,
      queues: { emailReview, refundReview },
      providerAcceptance:
        "Must be established by real provider-backed staging tests; configuration checks do not verify authorization or delivery.",
    });
  } catch (e) {
    return apiError(e);
  }
}
