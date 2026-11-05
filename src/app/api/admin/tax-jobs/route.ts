import { NextRequest, NextResponse } from "next/server";
import { TaxJob } from "@/models/TaxJob";
import { requirePermission } from "@/lib/admin";
import { apiError } from "@/lib/http";
export async function GET(_req: NextRequest) {
  try {
    await requirePermission("refunds.write");
    return NextResponse.json({
      items: await TaxJob.find().sort({ createdAt: -1 }).limit(100).lean(),
    });
  } catch (e) {
    return apiError(e);
  }
}
