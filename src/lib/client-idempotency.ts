"use client";
import { storageKey } from "@/config/site";
export async function operationKey(kind: string, body: unknown) {
  const fingerprint = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(body)),
      ),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const key = storageKey(`operation:${kind}`);
  try {
    const current = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (current?.fingerprint === fingerprint) return current.id;
  } catch {}
  const id = crypto.randomUUID();
  try {
    sessionStorage.setItem(key, JSON.stringify({ fingerprint, id }));
  } catch {}
  return id;
}
