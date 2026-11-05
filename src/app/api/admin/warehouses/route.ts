import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Warehouse } from "@/models/Warehouse";
import { requirePermission } from "@/lib/admin";
import { checkOrigin } from "@/lib/checkout-auth";
import { apiError, readJSON, RequestError } from "@/lib/http";
import { audit } from "@/lib/audit";
export async function POST(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    const actor = await requirePermission("inventory.manage"),
      input = z
        .object({
          id: z.string().regex(/^[a-z0-9-]{1,60}$/),
          name: z.string().trim().min(2).max(100),
        })
        .strict()
        .safeParse(await readJSON(req));
    if (!input.success) throw new RequestError("Invalid warehouse");
    await Warehouse.updateOne(
      { _id: input.data.id },
      { $set: { name: input.data.name, active: true } },
      { upsert: true },
    );
    await audit(actor.id, "warehouse.saved", input.data.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
