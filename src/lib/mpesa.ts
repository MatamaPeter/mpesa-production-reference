import "server-only";
const env = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing`);
  return v;
};
const base = () =>
  process.env.MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
export { normalizePhone } from "./phone";
function timestamp() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return ["year", "month", "day", "hour", "minute", "second"].map(get).join("");
}
async function jsonResponse(response: Response, context: string) {
  const raw = await response.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`${context}: non-JSON HTTP ${response.status}`);
  }
  if (!response.ok || data.errorCode) {
    throw new Error(
      `${context}: HTTP ${response.status}; code=${String(data.errorCode ?? "none")}; message=${String(data.errorMessage ?? data.ResponseDescription ?? "unknown").slice(0, 150)}`,
    );
  }
  return data;
}
async function accessToken() {
  const credentials = Buffer.from(
    `${env("MPESA_CONSUMER_KEY")}:${env("MPESA_CONSUMER_SECRET")}`,
  ).toString("base64");
  const response = await fetch(
    `${base()}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: { Authorization: `Basic ${credentials}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    },
  );
  const data = await jsonResponse(response, "OAuth");
  if (typeof data.access_token !== "string")
    throw new Error("OAuth token missing");
  return data.access_token;
}
function auth() {
  const shortcode = env("MPESA_SHORTCODE"),
    time = timestamp();
  return {
    shortcode,
    time,
    password: Buffer.from(shortcode + env("MPESA_PASSKEY") + time).toString(
      "base64",
    ),
  };
}
export async function stkPush(
  phone: string,
  amount: number,
  reference: string,
) {
  const { shortcode, time, password } = auth();
  const response = await fetch(`${base()}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: time,
      TransactionType: env("MPESA_TRANSACTION_TYPE"),
      Amount: amount,
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackURL: env("MPESA_CALLBACK_URL"),
      AccountReference: reference,
      TransactionDesc: "Online order",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const data = await jsonResponse(response, "STK Push");
  if (String(data.ResponseCode) !== "0" || !data.CheckoutRequestID)
    throw new Error(
      `STK Push rejected: ${String(data.ResponseDescription ?? "unknown")}`,
    );
  return {
    checkoutRequestId: String(data.CheckoutRequestID),
    merchantRequestId: String(data.MerchantRequestID ?? ""),
  };
}
export async function queryStk(checkoutRequestId: string) {
  const { shortcode, time, password } = auth();
  const response = await fetch(`${base()}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: time,
      CheckoutRequestID: checkoutRequestId,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const data = await jsonResponse(response, "STK Query");
  if (data.ResponseCode !== undefined && String(data.ResponseCode) !== "0")
    throw new Error(
      `STK Query rejected: ${String(data.ResponseDescription ?? "unknown")}`,
    );
  return {
    resultCode: data.ResultCode === undefined ? null : Number(data.ResultCode),
    resultDesc: String(data.ResultDesc ?? ""),
  };
}
