import { createHash, randomUUID } from "node:crypto";

import { env } from "~/env";
import { db } from "~/server/db";
import { multipartStorage } from "~/server/storage/multipart-client";
import { objectStore } from "~/server/storage/minio";
import { deleteOwnedUpload } from "~/server/uploads/service";
import {
  abortOwnedDirectUpload,
  completeDirectUpload,
  createDirectUploadSession,
  sweepExpiredDirectUploads,
} from "~/server/uploads/direct/session";
import { validateObservedUploadParts } from "~/server/uploads/direct/plan";

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testBytes(offset: number, byteSize: number): Buffer {
  const output = Buffer.allocUnsafe(byteSize);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = ((offset + index) * 31 + 165) & 0xff;
  }
  return output;
}

function fetchBody(bytes: Buffer): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

let corsChecked = false;

async function assertBrowserCors(url: string): Promise<void> {
  if (corsChecked) return;
  const origin = new URL(env.APP_URL).origin;
  const preflight = await fetch(url, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "PUT",
    },
  });
  invariant(preflight.ok, `Upload CORS preflight returned ${preflight.status}`);
  const allowedOrigin = preflight.headers.get("access-control-allow-origin");
  invariant(
    allowedOrigin === origin,
    `Upload CORS origin differs (expected ${origin}, received ${allowedOrigin ?? "none"})`,
  );
  invariant(
    preflight.headers
      .get("access-control-allow-methods")
      ?.toUpperCase()
      .includes("PUT"),
    "Upload CORS does not allow PUT",
  );
  corsChecked = true;
}

function configuredSizeBytes(): number {
  const mebibytes = Number(process.env.DIRECT_UPLOAD_SMOKE_MIB ?? "100");
  if (!Number.isInteger(mebibytes) || mebibytes < 65 || mebibytes > 2_048) {
    throw new Error(
      "DIRECT_UPLOAD_SMOKE_MIB must be an integer from 65 to 2048",
    );
  }
  return mebibytes * 1024 * 1024;
}

async function preparedBytes(byteSize: number) {
  const hash = createHash("sha256");
  const chunkBytes = 4 * 1024 * 1024;
  for (let offset = 0; offset < byteSize; offset += chunkBytes) {
    hash.update(testBytes(offset, Math.min(chunkBytes, byteSize - offset)));
  }
  return {
    sha256Hex: hash.digest("hex"),
    prefix: new Uint8Array(testBytes(0, 8 * 1024)),
  };
}

async function uploadParts(input: {
  sessionId: string;
  byteSize: number;
}): Promise<void> {
  const session = await db.directUploadSession.findUnique({
    where: { id: input.sessionId },
    select: {
      storageKey: true,
      s3UploadId: true,
      partSize: true,
      partCount: true,
    },
  });
  invariant(session?.s3UploadId, "Direct session is not ready for part upload");
  for (let first = 1; first <= session.partCount; first += 12) {
    const partNumbers = Array.from(
      { length: Math.min(12, session.partCount - first + 1) },
      (_, index) => first + index,
    );
    const signed = await Promise.all(
      partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await multipartStorage.signPart({
          key: session.storageKey,
          uploadId: session.s3UploadId!,
          partNumber,
          expiresInSeconds: 10 * 60,
        }),
      })),
    );
    for (let wave = 0; wave < signed.length; wave += 3) {
      await Promise.all(
        signed.slice(wave, wave + 3).map(async (part) => {
          if (env.DIRECT_UPLOAD_TRANSPORT === "presigned") {
            await assertBrowserCors(part.url);
          }
          const offset = (part.partNumber - 1) * session.partSize;
          const byteSize = Math.min(session.partSize, input.byteSize - offset);
          const originHeaders =
            env.DIRECT_UPLOAD_TRANSPORT === "presigned"
              ? { Origin: new URL(env.APP_URL).origin }
              : undefined;
          const response = await fetch(part.url, {
            method: "PUT",
            body: fetchBody(testBytes(offset, byteSize)),
            headers: originHeaders,
          });
          invariant(
            response.ok,
            `Part ${part.partNumber} failed with HTTP ${response.status}`,
          );
          invariant(response.headers.get("etag"), "Part response omitted ETag");
          if (env.DIRECT_UPLOAD_TRANSPORT === "presigned") {
            invariant(
              response.headers
                .get("access-control-expose-headers")
                ?.toLowerCase()
                .split(",")
                .map((value) => value.trim())
                .includes("etag"),
              "Upload CORS does not expose ETag",
            );
          }
        }),
      );
    }
  }
}

async function main(): Promise<void> {
  invariant(
    env.NODE_ENV !== "production" && /-(?:dev|ci)$/u.test(env.MINIO_BUCKET),
    "Direct upload smoke requires a non-production -dev or -ci bucket",
  );
  const byteSize = configuredSizeBytes();
  invariant(
    byteSize <= env.DIRECT_UPLOAD_MAX_BYTES,
    "Smoke size exceeds DIRECT_UPLOAD_MAX_BYTES",
  );
  const userId = `direct-smoke-${randomUUID()}`;
  await db.user.create({
    data: {
      id: userId,
      email: `${userId}@localhost.invalid`,
      name: "Direct upload smoke",
      storageLimitBytes: BigInt(byteSize + 80 * 1024 * 1024),
    },
  });
  const uploadIds: string[] = [];

  try {
    const prepared = await preparedBytes(byteSize);
    const happy = await createDirectUploadSession({
      userId,
      originalName: `direct-${byteSize}.bin`,
      byteSize,
      sha256Hex: prepared.sha256Hex,
      sniffPrefix: prepared.prefix,
      mediaOrigin: env.CDN_URL,
    });
    await uploadParts({ sessionId: happy.sessionId, byteSize });

    // Simulate a process dying after CompleteMultipartUpload but before the
    // session records storage completion. The service must recover via HEAD.
    const storedSession = await db.directUploadSession.findUnique({
      where: { id: happy.sessionId },
    });
    invariant(storedSession?.s3UploadId, "Session has no upstream upload id");
    const observed = validateObservedUploadParts({
      byteSize,
      partSize: storedSession.partSize,
      partCount: storedSession.partCount,
      parts: await multipartStorage.listParts({
        key: storedSession.storageKey,
        uploadId: storedSession.s3UploadId,
      }),
    });
    await multipartStorage.complete({
      key: storedSession.storageKey,
      uploadId: storedSession.s3UploadId,
      parts: observed,
    });

    const completions = await Promise.all([
      completeDirectUpload({ sessionId: happy.sessionId, userId }),
      completeDirectUpload({ sessionId: happy.sessionId, userId }),
    ]);
    const published = completions.find(
      (result) => result.state === "published",
    );
    invariant(
      published?.state === "published",
      "Concurrent completion did not publish",
    );
    uploadIds.push(published.record.id);
    const row = await db.upload.findUnique({
      where: { id: published.record.id },
      select: { byteSize: true, sha256: true, storageKey: true },
    });
    invariant(row?.byteSize === BigInt(byteSize), "Published size differs");
    invariant(
      Buffer.from(row.sha256).toString("hex") === prepared.sha256Hex,
      "Published SHA-256 differs",
    );
    const head = await objectStore.head(row.storageKey);
    invariant(head?.byteSize === byteSize, "Stored object size differs");

    const abortSize = 65 * 1024 * 1024;
    const abortPrepared = await preparedBytes(abortSize);
    const aborted = await createDirectUploadSession({
      userId,
      originalName: "abort.bin",
      byteSize: abortSize,
      sha256Hex: abortPrepared.sha256Hex,
      sniffPrefix: abortPrepared.prefix,
      mediaOrigin: env.CDN_URL,
    });
    const abortSession = await db.directUploadSession.findUnique({
      where: { id: aborted.sessionId },
    });
    invariant(abortSession?.s3UploadId, "Abort session was not activated");
    const firstPartUrl = await multipartStorage.signPart({
      key: abortSession.storageKey,
      uploadId: abortSession.s3UploadId,
      partNumber: 1,
      expiresInSeconds: 10 * 60,
    });
    invariant(
      (
        await fetch(firstPartUrl, {
          method: "PUT",
          body: fetchBody(testBytes(0, abortSession.partSize)),
        })
      ).ok,
      "Abort setup part failed",
    );
    await abortOwnedDirectUpload({ sessionId: aborted.sessionId, userId });
    invariant(
      (await objectStore.head(abortSession.storageKey)) === null,
      "Aborted object remained stored",
    );

    const wrongHash = await createDirectUploadSession({
      userId,
      originalName: "wrong-hash.bin",
      byteSize: abortSize,
      sha256Hex: "0".repeat(64),
      sniffPrefix: abortPrepared.prefix,
      mediaOrigin: env.CDN_URL,
    });
    await uploadParts({
      sessionId: wrongHash.sessionId,
      byteSize: abortSize,
    });
    await completeDirectUpload({ sessionId: wrongHash.sessionId, userId }).then(
      () => {
        throw new Error("Wrong SHA-256 was published");
      },
      () => undefined,
    );
    invariant(
      (
        await db.directUploadSession.findUnique({
          where: { id: wrongHash.sessionId },
          select: { state: true },
        })
      )?.state === "FAILED",
      "Wrong SHA-256 did not fail the session",
    );

    const lyingPrefixBytes = abortPrepared.prefix.slice();
    lyingPrefixBytes[0] = (lyingPrefixBytes[0]! + 1) & 0xff;
    const lyingPrefix = await createDirectUploadSession({
      userId,
      originalName: "lying-prefix.bin",
      byteSize: abortSize,
      sha256Hex: abortPrepared.sha256Hex,
      sniffPrefix: lyingPrefixBytes,
      mediaOrigin: env.CDN_URL,
    });
    await uploadParts({
      sessionId: lyingPrefix.sessionId,
      byteSize: abortSize,
    });
    await completeDirectUpload({
      sessionId: lyingPrefix.sessionId,
      userId,
    }).then(
      () => {
        throw new Error("Lying prefix was published");
      },
      () => undefined,
    );
    invariant(
      (
        await db.directUploadSession.findUnique({
          where: { id: lyingPrefix.sessionId },
          select: { state: true },
        })
      )?.state === "FAILED",
      "Lying prefix did not fail the session",
    );

    const expired = await createDirectUploadSession({
      userId,
      originalName: "expired.bin",
      byteSize: abortSize,
      sha256Hex: abortPrepared.sha256Hex,
      sniffPrefix: abortPrepared.prefix,
      mediaOrigin: env.CDN_URL,
    });
    await db.directUploadSession.update({
      where: { id: expired.sessionId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const swept = await sweepExpiredDirectUploads({ limit: 10 });
    invariant(swept.claimed >= 1 && swept.failed === 0, "Expiry sweep failed");

    process.stdout.write(
      `Direct upload smoke passed ${byteSize} bytes, HEAD crash recovery, concurrent completion, abort, quota accounting, wrong-hash/prefix rejection, and expiry cleanup.\n`,
    );
  } finally {
    for (const uploadId of uploadIds.reverse()) {
      await deleteOwnedUpload({ userId, uploadId }).catch(() => undefined);
    }
    const sessions = await db.directUploadSession.findMany({
      where: { userId, state: { not: "PUBLISHED" } },
      select: { id: true },
    });
    for (const session of sessions) {
      await abortOwnedDirectUpload({ sessionId: session.id, userId }).catch(
        () => undefined,
      );
    }
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  }
}

await main();
