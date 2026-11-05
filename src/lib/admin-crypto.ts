import {
  createHmac,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
export function verifyPassword(password: string, encoded: string) {
  const [salt, hash] = encoded.split(":");
  if (
    !salt ||
    !/^[a-f0-9]{32}$/.test(salt) ||
    !hash ||
    !/^[a-f0-9]{128}$/.test(hash)
  )
    return false;
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}
export function signAdminSession(
  secret: string,
  passwordHash: string,
  now = Date.now(),
) {
  const body = Buffer.from(
    JSON.stringify({
      expires: now + 8 * 3600000,
      fingerprint: createHash("sha256").update(passwordHash).digest("hex"),
    }),
  ).toString("base64url");
  return (
    body + "." + createHmac("sha256", secret).update(body).digest("base64url")
  );
}
export function validAdminSession(
  token: string,
  secret: string,
  passwordHash: string,
  now = Date.now(),
) {
  try {
    const [body, signature, ...extra] = token.split(".");
    if (extra.length || !body || !signature) return false;
    const expected = createHmac("sha256", secret).update(body).digest();
    const received = Buffer.from(signature, "base64url");
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    )
      return false;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    return (
      typeof payload.expires === "number" &&
      payload.expires > now &&
      payload.expires <= now + 8 * 3600000 &&
      payload.fingerprint ===
        createHash("sha256").update(passwordHash).digest("hex")
    );
  } catch {
    return false;
  }
}
