import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { checkOrigin } from "@/lib/checkout-auth";
export async function POST(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  (await cookies()).delete("leron_admin");
  return NextResponse.json({ ok: true });
}
