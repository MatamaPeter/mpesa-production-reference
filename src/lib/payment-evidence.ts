import { z } from "zod";
const callbackSchema = z.object({
  CheckoutRequestID: z.string(),
  MerchantRequestID: z.string(),
  ResultCode: z.number().int(),
  CallbackMetadata: z.object({
    Item: z.array(z.object({ Name: z.string(), Value: z.unknown() })),
  }),
});
export function receiptFromCallback(payment: {
  callbackPayload: unknown;
  checkoutRequestId: string;
  merchantRequestId?: string;
  amount: number;
  phone: string;
}): string | null {
  const parsed = callbackSchema.safeParse(payment.callbackPayload);
  if (!parsed.success) return null;
  const cb = parsed.data;
  if (
    cb.CheckoutRequestID !== payment.checkoutRequestId ||
    (payment.merchantRequestId &&
      cb.MerchantRequestID !== payment.merchantRequestId) ||
    cb.ResultCode !== 0
  )
    return null;
  const names = cb.CallbackMetadata.Item.map((i) => i.Name);
  if (new Set(names).size !== names.length) return null;
  const fields = Object.fromEntries(
    cb.CallbackMetadata.Item.map((i) => [i.Name, i.Value]),
  );
  if (
    Number(fields.Amount) !== payment.amount ||
    String(fields.PhoneNumber) !== payment.phone ||
    typeof fields.MpesaReceiptNumber !== "string" ||
    !fields.MpesaReceiptNumber
  )
    return null;
  return fields.MpesaReceiptNumber;
}
