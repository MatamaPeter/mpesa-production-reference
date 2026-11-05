import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SupportTicket } from "@/models/SupportTicket";
import { currentCustomer } from "@/lib/customer-auth";
import { checkOrigin, checkoutIdentity } from "@/lib/checkout-auth";
import { connectDB } from "@/lib/db";
import { commerceEnabled } from "@/lib/store";
import { rateLimit } from "@/lib/rate-limit";
import { apiError, readJSON, RequestError } from "@/lib/http";
export async function GET() {
  try {
    const user = await currentCustomer(),
      guest = await checkoutIdentity();
    if (!user && !guest) throw new RequestError("Session required", 401);
    await connectDB();
    return NextResponse.json({
      items: await SupportTicket.find({
        $or: [
          ...(user ? [{ customerId: user.id }] : []),
          ...(guest ? [{ ownerTokenHash: guest }] : []),
        ],
      })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    if (!commerceEnabled())
      throw new RequestError("Support requests will open with the store", 503);
    const input = z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z.email().max(254),
        topic: z.enum(["order", "product", "return", "privacy", "other"]),
        subject: z.string().trim().min(3).max(160),
        message: z.string().trim().min(10).max(5000),
        website: z.string().max(0).default(""),
      })
      .strict()
      .safeParse(await readJSON(req));
    if (!input.success)
      throw new RequestError("Check your contact details and message");
    const user = await currentCustomer(),
      guest = await checkoutIdentity(true);
    await rateLimit("support-global", "global", 30);
    await rateLimit("support", user?.id ?? guest!, 5, 3600000);
    const ticket = await SupportTicket.create({
      customerId: user?.id,
      ownerTokenHash: guest,
      name: input.data.name,
      email: input.data.email,
      topic: input.data.topic,
      subject: input.data.subject,
      messages: [{ from: "customer", body: input.data.message }],
    });
    return NextResponse.json(
      { id: String(ticket._id), ok: true },
      { status: 201 },
    );
  } catch (e) {
    return apiError(e);
  }
}
