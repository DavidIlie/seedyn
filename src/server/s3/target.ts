import { S3_FIXED_BUCKET } from "./constants";
import { S3ProtocolError } from "./errors";

const SAFE_KEY_SEGMENT = /^[A-Za-z0-9._-]{1,255}$/u;
const MAX_KEY_BYTES = 1_024;

function hasQuery(request: Request): boolean {
  const queryIndex = request.url.indexOf("?");
  return queryIndex !== -1;
}

function requestPathname(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch (error) {
    throw new S3ProtocolError("InvalidRequest", "The request URL is invalid.", {
      cause: error,
    });
  }
}

export function parseSafeObjectKey(parts: readonly string[]): string {
  if (parts.length === 0) {
    throw new S3ProtocolError("InvalidArgument", "The object key is missing.");
  }
  for (const part of parts) {
    if (
      !SAFE_KEY_SEGMENT.test(part) ||
      part === "." ||
      part === ".." ||
      part.includes("%")
    ) {
      throw new S3ProtocolError(
        "InvalidArgument",
        "The object key contains unsupported characters.",
      );
    }
  }
  const key = parts.join("/");
  if (Buffer.byteLength(key, "utf8") > MAX_KEY_BYTES) {
    throw new S3ProtocolError("InvalidArgument", "The object key is too long.");
  }
  return key;
}

export function canonicalObjectUri(request: Request, key: string): string {
  if (hasQuery(request)) {
    throw new S3ProtocolError(
      "NotImplemented",
      "Query-based S3 operations are not supported.",
    );
  }
  const expected = `/${S3_FIXED_BUCKET}/${key}`;
  if (requestPathname(request) !== expected) {
    throw new S3ProtocolError(
      "InvalidRequest",
      "The request path is not canonical.",
    );
  }
  return expected;
}

export function canonicalBucketUri(request: Request): string {
  if (hasQuery(request)) {
    throw new S3ProtocolError(
      "NotImplemented",
      "Query-based S3 operations are not supported.",
    );
  }
  const pathname = requestPathname(request);
  if (
    pathname !== `/${S3_FIXED_BUCKET}` &&
    pathname !== `/${S3_FIXED_BUCKET}/`
  ) {
    throw new S3ProtocolError(
      "InvalidBucketName",
      "The requested bucket is invalid.",
    );
  }
  return pathname;
}
