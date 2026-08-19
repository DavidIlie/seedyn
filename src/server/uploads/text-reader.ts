import "server-only";

import { db } from "~/server/db";
import { objectStore } from "~/server/storage/minio";

const MAX_INLINE_TEXT_BYTES = 1024 * 1024;

export type OwnedTextContent =
  | { status: "ready"; content: string }
  | { status: "too_large" }
  | { status: "unavailable" };

export async function readOwnedTextContent(
  userId: string,
  uploadId: string,
): Promise<OwnedTextContent> {
  const upload = await db.upload.findFirst({
    where: { id: uploadId, userId, kind: "TEXT", state: "READY" },
    select: { storageKey: true, byteSize: true },
  });
  if (!upload) return { status: "unavailable" };
  if (upload.byteSize > BigInt(MAX_INLINE_TEXT_BYTES)) {
    return { status: "too_large" };
  }

  try {
    const stream = await objectStore.stream(upload.storageKey);
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const rawChunk of stream) {
      const chunk = Buffer.isBuffer(rawChunk)
        ? rawChunk
        : Buffer.from(rawChunk);
      total += chunk.byteLength;
      if (total > MAX_INLINE_TEXT_BYTES) {
        stream.destroy();
        return { status: "too_large" };
      }
      chunks.push(chunk);
    }
    return { status: "ready", content: Buffer.concat(chunks).toString("utf8") };
  } catch {
    return { status: "unavailable" };
  }
}
