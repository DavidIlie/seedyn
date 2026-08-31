import { db } from "~/server/db";

const RETENTION_DAYS = 400;
const BATCH_SIZE = 1_000;

async function main() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1_000);
  let deleted = 0;
  for (;;) {
    const rows = await db.auditEvent.findMany({
      where: { occurredAt: { lt: cutoff } },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      take: BATCH_SIZE,
      select: { id: true },
    });
    if (rows.length === 0) break;
    const result = await db.auditEvent.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
    deleted += result.count;
    if (rows.length < BATCH_SIZE) break;
  }
  console.info(
    JSON.stringify({
      event: "audit_prune_complete",
      retentionDays: RETENTION_DAYS,
      deleted,
    }),
  );
}

await main().finally(() => db.$disconnect());
