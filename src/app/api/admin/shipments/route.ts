import { pageRecords } from "@/lib/pagination";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { Shipment } from "@/models/Shipment";
import { Order } from "@/models/Order";
import { Warehouse } from "@/models/Warehouse";
import { requirePermission } from "@/lib/admin";
import { checkOrigin } from "@/lib/checkout-auth";
import { shippingClient, safeProviderURL } from "@/lib/shipping";
import { addressSchema } from "@/lib/commerce";
import { audit } from "@/lib/audit";
import { apiError, readJSON, RequestError } from "@/lib/http";
export async function GET(req: NextRequest) {
  try {
    await requirePermission("orders.fulfill");
    return NextResponse.json(await pageRecords(Shipment, req, {}));
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    const actor = await requirePermission("orders.fulfill"),
      input = z
        .object({
          orderId: z.string().regex(/^[a-f0-9]{24}$/i),
          warehouse: z.string().regex(/^[a-z0-9-]{1,60}$/),
          customsDeclarationId: z.string().max(100).optional(),
          parcels: z
            .array(
              z.object({
                length: z.number().positive().max(300),
                width: z.number().positive().max(300),
                height: z.number().positive().max(300),
                weightGrams: z.number().positive().max(100000),
              }),
            )
            .min(1)
            .max(10),
        })
        .strict()
        .safeParse(await readJSON(req));
    if (!input.success)
      throw new RequestError("Check shipment dimensions and weights");
    const d = input.data,
      order = await Order.findOne({
        _id: d.orderId,
        status: "paid",
        paymentHold: { $ne: true },
        fulfillment: { $in: ["unfulfilled", "processing"] },
      }).lean();
    if (!order)
      throw new RequestError("Only unshipped paid orders can be quoted", 409);
    const allocated = order.items.some(
      (i: { allocations?: { warehouse: string }[] }) =>
        i.allocations?.length
          ? i.allocations.some((a) => a.warehouse === d.warehouse)
          : d.warehouse === "default",
    );
    if (!allocated)
      throw new RequestError(
        "This warehouse has no allocation for this order",
        409,
      );
    const warehouse = await Warehouse.findOne({
      _id: d.warehouse,
      active: true,
    }).lean();
    if (!warehouse) throw new RequestError("Warehouse unavailable", 409);
    let from;
    try {
      from = addressSchema.parse(
        warehouse.address ??
          JSON.parse(process.env.SHIP_FROM_ADDRESS_JSON ?? "null"),
      );
    } catch {
      throw new RequestError(
        "Configure the verified sender address for this warehouse",
        503,
      );
    }
    if (from.country !== order.address.country && !d.customsDeclarationId)
      throw new RequestError(
        "International shipments require an approved customs declaration ID",
      );
    const existing = await Shipment.findOne({
      orderId: order._id,
      warehouse: d.warehouse,
    });
    if (
      existing &&
      ["purchasing", "purchased", "review"].includes(existing.status)
    )
      throw new RequestError(
        "A label exists or needs review for this warehouse allocation",
        409,
      );
    const client = shippingClient();
    const quote = await client.shipments.create({
      addressFrom: {
        name: from.name,
        email: from.email,
        phone: from.phone,
        street1: from.line1,
        street2: from.line2,
        city: from.city,
        state: from.region,
        zip: from.postalCode,
        country: from.country,
      },
      addressTo: {
        name: order.address.name,
        email: order.address.email,
        phone: order.address.phone,
        street1: order.address.line1,
        street2: order.address.line2,
        city: order.address.city,
        state: order.address.region,
        zip: order.address.postalCode,
        country: order.address.country,
      },
      parcels: d.parcels.map((p) => ({
        length: String(p.length),
        width: String(p.width),
        height: String(p.height),
        weight: String(p.weightGrams),
        distanceUnit: "cm",
        massUnit: "g",
      })),
      customsDeclaration: d.customsDeclarationId,
      async: false,
      metadata: `order:${order._id};warehouse:${d.warehouse}`,
    });
    const rates = quote.rates.map((r) => ({
      id: r.objectId,
      provider: r.provider,
      service: r.servicelevel?.name ?? "Carrier service",
      amount: r.amount,
      currency: r.currency,
    }));
    if (!rates.length)
      throw new RequestError(
        "No carrier rates are available for this shipment",
        409,
      );
    const record = await Shipment.findOneAndUpdate(
      {
        orderId: order._id,
        warehouse: d.warehouse,
        status: { $nin: ["purchased", "purchasing", "review"] },
      },
      {
        $set: {
          status: "quoted",
          providerShipmentId: quote.objectId,
          rates,
          expiresAt: new Date(Date.now() + 15 * 60000),
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    await audit(actor.id, "shipment.quoted", String(record._id));
    return NextResponse.json({ id: String(record._id), rates });
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(req: NextRequest) {
  if (!checkOrigin(req))
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  try {
    const actor = await requirePermission("orders.fulfill");
    if (process.env.SHIPPING_LABEL_PURCHASE_ENABLED !== "true")
      throw new RequestError("Paid label purchases are not enabled", 503);
    const input = z
      .object({
        id: z.string().regex(/^[a-f0-9]{24}$/i),
        rateId: z.string().min(1).max(100),
        trackingCarrier: z.string().regex(/^[a-z0-9_]{1,80}$/),
      })
      .strict()
      .safeParse(await readJSON(req));
    if (!input.success) throw new RequestError("Invalid label request");
    const d = input.data,
      client = shippingClient(),
      session = await mongoose.startSession();
    let row: any;
    try {
      await session.withTransaction(async () => {
        row = await Shipment.findOneAndUpdate(
          {
            _id: d.id,
            status: "quoted",
            expiresAt: { $gt: new Date() },
            "rates.id": d.rateId,
          },
          {
            $set: { status: "purchasing", trackingCarrier: d.trackingCarrier },
          },
          { session, returnDocument: "after" },
        );
        if (!row)
          throw new RequestError(
            "This quote expired or a purchase is already active",
            409,
          );
        const order = await Order.findOneAndUpdate(
          {
            _id: row.orderId,
            status: "paid",
            paymentHold: { $ne: true },
            fulfillment: { $in: ["unfulfilled", "processing"] },
          },
          { $inc: { shipmentVersion: 1 } },
          { session },
        );
        if (!order) throw new RequestError("Order cannot be shipped", 409);
        await audit(
          actor.id,
          "shipment.label_requested",
          d.id,
          { rateId: d.rateId },
          session,
        );
      });
    } finally {
      await session.endSession();
    }
    try {
      const label = await client.transactions.create(
        {
          rate: d.rateId,
          labelFileType: "PDF",
          async: false,
          metadata: `shipment:${row._id}`,
        },
        { retries: { strategy: "none" } },
      );
      if (
        label.status !== "SUCCESS" ||
        !label.objectId ||
        !label.trackingNumber
      )
        throw new Error("Label outcome requires review");
      await Shipment.updateOne(
        { _id: row._id, status: "purchasing" },
        {
          $set: {
            status: "purchased",
            providerTransactionId: label.objectId,
            trackingNumber: label.trackingNumber,
            labelUrl: safeProviderURL(label.labelUrl),
            trackingUrl: safeProviderURL(label.trackingUrlProvider),
            nextCheckAt: new Date(),
          },
        },
      );
      return NextResponse.json({ ok: true });
    } catch {
      await Shipment.updateOne(
        { _id: row._id, status: "purchasing" },
        { $set: { status: "review" } },
      );
      throw new RequestError(
        "Label purchase outcome is uncertain. Verify the carrier dashboard before retrying.",
        503,
      );
    }
  } catch (e) {
    return apiError(e);
  }
}
