import "server-only";

import { DomainError } from "~/server/uploads/errors";

export async function readBoundedJson(
  request: Request,
  maximumBytes = 32 * 1024,
): Promise<unknown> {
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1 ||
    maximumBytes > 1024 * 1024
  ) {
    throw new TypeError("JSON body limit is invalid");
  }
  const contentType = request.headers.get("content-type")?.split(";", 1)[0];
  if (contentType !== "application/json") {
    throw new DomainError("invalid_input", {
      message: "Content-Type must be application/json.",
    });
  }
  const contentLength = request.headers.get("content-length");
  if (
    contentLength &&
    (!/^(?:0|[1-9]\d{0,6})$/u.test(contentLength) ||
      Number(contentLength) > maximumBytes)
  ) {
    throw new DomainError("payload_too_large", {
      message: "The JSON control request is too large.",
    });
  }
  if (!request.body) throw new DomainError("invalid_input");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new DomainError("payload_too_large", {
          message: "The JSON control request is too large.",
        });
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new DomainError("invalid_input", {
      message: "The JSON control request is malformed.",
      cause: error,
    });
  }
}
