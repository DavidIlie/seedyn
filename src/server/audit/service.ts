import "server-only";

import { db } from "~/server/db";
import { safeAuditMetadata } from "~/server/audit/sanitize";

export type AuditInput = {
  category: "API" | "AUTH" | "ACCOUNT" | "CONTENT" | "CREDENTIAL" | "ADMIN";
  action: string;
  outcome?: "SUCCESS" | "DENIED" | "FAILURE";
  actorType: "USER" | "API_KEY" | "ANONYMOUS" | "SYSTEM";
  userId?: string | null;
  actorLabel?: string | null;
  apiKeyId?: string | null;
  requestId?: string | null;
  method?: string | null;
  route?: string | null;
  statusCode?: number | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

function bounded(value: string | null | undefined, maximum = 160) {
  if (!value) return null;
  return value.normalize("NFC").slice(0, maximum);
}

/** Audit writes never break the product path and never accept bodies or credentials. */
export async function recordAuditEvent(input: AuditInput): Promise<void> {
  try {
    await db.auditEvent.create({
      data: {
        category: input.category,
        action: bounded(input.action, 80) ?? "unknown",
        outcome: input.outcome ?? "SUCCESS",
        actorType: input.actorType,
        userId: bounded(input.userId, 128),
        actorLabel: bounded(input.actorLabel),
        apiKeyId: bounded(input.apiKeyId, 128),
        requestId: bounded(input.requestId, 128),
        method: bounded(input.method, 12),
        route: bounded(input.route, 200),
        statusCode: input.statusCode,
        targetType: bounded(input.targetType, 80),
        targetId: bounded(input.targetId, 160),
        metadata: safeAuditMetadata(input.metadata),
      },
    });
  } catch {
    console.error(
      JSON.stringify({ event: "audit_write_failed", action: input.action }),
    );
  }
}
