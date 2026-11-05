import "server-only";
import { Shippo } from "shippo";
import { Shipment } from "@/models/Shipment";
export function shippingClient() {
  if (!process.env.SHIPPO_API_TOKEN)
    throw new Error("Carrier integration not configured");
  return new Shippo({
    apiKeyHeader: process.env.SHIPPO_API_TOKEN,
    retryConfig: { strategy: "none" },
    timeoutMs: 15000,
  });
}
export function safeProviderURL(value: string | undefined) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}
export async function pollShipments() {
  if (process.env.SHIPPING_TRACKING_ENABLED !== "true")
    return { trackingWorkerEnabled: false };
  let checked = 0;
  const rows = await Shipment.find({
    status: "purchased",
    nextCheckAt: { $lte: new Date() },
    trackingCarrier: { $ne: "" },
    deliveryStatus: { $ne: "DELIVERED" },
  })
    .sort({ nextCheckAt: 1 })
    .limit(2);
  for (const row of rows) {
    try {
      const result = await shippingClient().trackingStatus.get(
        row.trackingNumber,
        row.trackingCarrier,
      );
      if (result.trackingNumber !== row.trackingNumber)
        throw new Error("Tracking evidence mismatch");
      await Shipment.updateOne(
        { _id: row._id },
        {
          $set: {
            deliveryStatus: result.trackingStatus?.status ?? "UNKNOWN",
            nextCheckAt: new Date(Date.now() + 30 * 60000),
          },
        },
      );
      checked++;
    } catch {
      await Shipment.updateOne(
        { _id: row._id },
        { $set: { nextCheckAt: new Date(Date.now() + 15 * 60000) } },
      );
    }
  }
  return { trackingWorkerEnabled: true, shipmentsChecked: checked };
}
