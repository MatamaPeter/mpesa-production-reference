import {
  createHash,
  createHmac,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from "node:crypto";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function toBase32(bytes: Uint8Array) {
  let bits = 0,
    value = 0,
    result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
function fromBase32(text: string) {
  let bits = 0,
    value = 0;
  const result = [];
  for (const char of text.toUpperCase()) {
    const i = alphabet.indexOf(char);
    if (i < 0) throw new Error("Invalid authenticator secret");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      result.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(result);
}
export function totpAt(secret: string, counter: number) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", fromBase32(secret)).update(buffer).digest(),
    offset = mac[mac.length - 1] & 15;
  return ((mac.readUInt32BE(offset) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
export function verifyTotp(
  secret: string,
  code: string,
  lastCounter = -1,
  now = Date.now(),
) {
  if (!/^\d{6}$/.test(code)) return null;
  const counter = Math.floor(now / 30000);
  for (const c of [counter, counter - 1, counter + 1]) {
    if (c < 0 || c <= lastCounter) continue;
    if (timingSafeEqual(Buffer.from(totpAt(secret, c)), Buffer.from(code)))
      return c;
  }
  return null;
}
function encryptionKey() {
  const value = process.env.AUTH_ENCRYPTION_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value))
    throw new Error(
      "AUTH_ENCRYPTION_KEY must contain 32 random bytes encoded as 64 hexadecimal characters",
    );
  return Buffer.from(value, "hex");
}
export function seal(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv),
    encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function unseal(value: string) {
  const [iv, tag, data] = value.split(".");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
