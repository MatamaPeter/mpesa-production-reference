import { NextResponse } from "next/server";
import { commerceEnabled } from "@/lib/store";
import { connectDB } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!commerceEnabled())
    return NextResponse.json(
      { status: "preview" },
      { headers: { "Cache-Control": "no-store" } },
    );
  try {
    const connection = await connectDB();
    await connection.connection.db?.admin().ping();
    return NextResponse.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
