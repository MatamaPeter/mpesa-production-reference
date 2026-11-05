import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { catalog, isSKU } from "@/lib/catalog";
import { checkOrigin, checkoutIdentity } from "@/lib/checkout-auth";
import { Order } from "@/models/Order";
export const runtime = "nodejs";
const schema = z.object({ items: z.array(z.object({ sku: z.string(), qty: z.number().int().min(1).max(20) })).min(1).max(20) });
export async function POST(req: NextRequest) {
  if (!checkOrigin(req)) return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid items" }, { status: 400 });
    if (parsed.data.items.some(i => !isSKU(i.sku))) return NextResponse.json({ error: "Unknown SKU" }, { status: 400 });
    const ownerTokenHash = await checkoutIdentity(true);
    const items = parsed.data.items.map(i => ({ sku: i.sku, name: catalog[i.sku as keyof typeof catalog].name, qty: i.qty, unitPriceKES: catalog[i.sku as keyof typeof catalog].priceKES }));
    const amount = items.reduce((sum, i) => sum + i.qty * i.unitPriceKES, 0);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Invalid amount");
    await connectDB();
    const order = await Order.create({ ownerTokenHash, items, amount, status: "unpaid" });
    return NextResponse.json({ orderId: String(order._id), amount }, { status: 201 });
  } catch (e) { console.error("[CREATE_ORDER]", e); return NextResponse.json({ error: "Could not create order" }, { status: 500 }); }
}
