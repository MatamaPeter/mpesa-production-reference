import "server-only";
import type { ClientSession } from "mongoose";
import { AuditEvent } from "@/models/AuditEvent";
export async function audit(
  actor: string,
  action: string,
  resource: string,
  details: Record<string, unknown> = {},
  session?: ClientSession,
) {
  await AuditEvent.create(
    [{ actor, action, resource, details }],
    session ? { session } : {},
  );
}
