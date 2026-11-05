import { NextRequest, NextResponse } from "next/server";
import { AuditEvent } from "@/models/AuditEvent";
import { requirePermission } from "@/lib/admin";
import { apiError, RequestError } from "@/lib/http";
export async function GET(req: NextRequest) {
  try {
    await requirePermission("audit.read");
    const cursor = req.nextUrl.searchParams.get("cursor");
    if (cursor && !/^[a-f0-9]{24}$/i.test(cursor))
      throw new RequestError("Invalid cursor");
    const items = await AuditEvent.find(cursor ? { _id: { $lt: cursor } } : {})
      .sort({ _id: -1 })
      .limit(51)
      .lean();
    return NextResponse.json({
      items: items.slice(0, 50),
      nextCursor: items.length > 50 ? String(items[49]._id) : null,
    });
  } catch (e) {
    return apiError(e);
  }
}
