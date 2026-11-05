import { Schema, model, models } from "mongoose";
const schema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    warehouse: { type: String, required: true },
    providerShipmentId: String,
    status: {
      type: String,
      enum: ["quoting", "quoted", "purchasing", "purchased", "review"],
      default: "quoting",
    },
    rates: [
      {
        id: String,
        provider: String,
        service: String,
        amount: String,
        currency: String,
      },
    ],
    expiresAt: Date,
    providerTransactionId: String,
    trackingNumber: String,
    trackingCarrier: String,
    labelUrl: String,
    trackingUrl: String,
    deliveryStatus: String,
    nextCheckAt: Date,
  },
  { timestamps: true },
);
schema.index({ orderId: 1, warehouse: 1 }, { unique: true });
schema.index({ status: 1, nextCheckAt: 1 });
export const Shipment = models.Shipment || model("Shipment", schema);
