import "server-only";

import { db } from "~/server/db";

import { requireAdmin } from "./authorization";

export const ADMIN_AUDIT_PAGE_SIZE = 50;

export type AdminAuditPage = Awaited<ReturnType<typeof loadAdminAuditPage>>;

export async function loadAdminAuditPage(cursor?: string) {
  await requireAdmin();
  const anchor = cursor
    ? await db.auditEvent.findUnique({
        where: { id: cursor },
        select: { id: true, occurredAt: true },
      })
    : null;
  const rows = await db.auditEvent.findMany({
    where: anchor
      ? {
          OR: [
            { occurredAt: { lt: anchor.occurredAt } },
            { occurredAt: anchor.occurredAt, id: { lt: anchor.id } },
          ],
        }
      : undefined,
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: ADMIN_AUDIT_PAGE_SIZE + 1,
    include: { user: { select: { name: true, email: true } } },
  });
  const hasMore = rows.length > ADMIN_AUDIT_PAGE_SIZE;
  const items = rows.slice(0, ADMIN_AUDIT_PAGE_SIZE).map((event) => ({
    id: event.id,
    occurredAt: event.occurredAt.toISOString(),
    category: event.category,
    action: event.action,
    outcome: event.outcome,
    actorType: event.actorType,
    actorLabel: event.actorLabel,
    actor: event.user?.name ?? event.user?.email ?? event.actorLabel,
    method: event.method,
    route: event.route,
    statusCode: event.statusCode,
    targetType: event.targetType,
    targetId: event.targetId,
    metadata:
      event.metadata && typeof event.metadata === "object"
        ? JSON.stringify(event.metadata)
        : null,
  }));
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}
