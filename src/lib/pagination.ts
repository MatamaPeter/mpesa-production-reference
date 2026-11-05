import "server-only";
import type { NextRequest } from "next/server";
import { RequestError } from "./http";
export async function pageRecords(
  model: any,
  req: NextRequest,
  filter: Record<string, unknown> = {},
  select?: string,
) {
  const cursor = req.nextUrl.searchParams.get("cursor");
  const pattern =
    model.schema.path("_id").instance === "ObjectId"
      ? /^[a-f0-9]{24}$/i
      : /^[a-f0-9]{32}$/i;
  if (cursor && !pattern.test(cursor))
    throw new RequestError("Invalid page cursor");
  let query = model
    .find({ ...filter, ...(cursor ? { _id: { $lt: cursor } } : {}) })
    .sort({ _id: -1 })
    .limit(51);
  if (select) query = query.select(select);
  const rows = await query.lean();
  return {
    items: rows.slice(0, 50),
    nextCursor: rows.length > 50 ? String(rows[49]._id) : null,
  };
}
