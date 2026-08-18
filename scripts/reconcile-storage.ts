import { Prisma } from "@prisma/client";

import { db } from "~/server/db";
import { objectStore } from "~/server/storage/minio";
import { inspectStorageConsistency } from "~/server/storage/reconcile";

const ORPHAN_SAFETY_AGE_MS = 10 * 60 * 1_000;

async function readReadyKeys(): Promise<Set<string>> {
  const [uploads, variants] = await db.$transaction(
    [
      db.upload.findMany({
        where: { state: "READY" },
        select: { storageKey: true },
      }),
      db.uploadVariant.findMany({
        where: { state: "READY", upload: { state: "READY" } },
        select: { storageKey: true },
      }),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
  return new Set([
    ...uploads.map((row) => row.storageKey),
    ...variants.map((row) => row.storageKey),
  ]);
}

async function main(): Promise<void> {
  const before = await readReadyKeys();
  const report = await inspectStorageConsistency({
    store: objectStore,
    prefix: "users/",
    expectedKeys: before,
    orphanedBefore: new Date(Date.now() - ORPHAN_SAFETY_AGE_MS),
  });
  const after = await readReadyKeys();

  // Confirm both sides of the storage walk. Rows/objects that appeared or
  // disappeared during the scan are deferred to the next run, not mislabeled.
  const orphanObjectKeys = report.orphanObjectKeys.filter(
    (key) => !after.has(key),
  );
  const missingObjectKeys = report.missingObjectKeys.filter((key) =>
    after.has(key),
  );
  const deletionStates = await db.upload.groupBy({
    by: ["state"],
    where: { state: { in: ["DELETING", "DELETE_FAILED"] } },
    _count: { _all: true },
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        mode: "read-only-advisory",
        orphanSafetyAgeSeconds: ORPHAN_SAFETY_AGE_MS / 1_000,
        expectedObjectCountBefore: before.size,
        expectedObjectCountAfter: after.size,
        anomalousObjectCount: report.anomalousObjectKeys.length,
        orphanObjectCount: orphanObjectKeys.length,
        missingObjectCount: missingObjectKeys.length,
        deletionStates: Object.fromEntries(
          deletionStates.map((row) => [row.state, row._count._all]),
        ),
        anomalousObjectKeys: report.anomalousObjectKeys,
        orphanObjectKeys,
        missingObjectKeys,
      },
      null,
      2,
    )}\n`,
  );
  if (
    report.anomalousObjectKeys.length ||
    orphanObjectKeys.length ||
    missingObjectKeys.length
  ) {
    process.exitCode = 2;
  }
}

await main().finally(async () => db.$disconnect());
