import { fileTypeFromBuffer } from "file-type";

import type { ContentDisposition, UploadKind } from "@prisma/client";

import { DomainError } from "~/server/uploads/errors";
import { UPLOAD_LIMITS } from "~/server/uploads/multipart";

export const DIRECT_UPLOAD_PART_BYTES = 16 * 1024 * 1024;
export const DIRECT_UPLOAD_CONCURRENCY = 3;
export const DIRECT_UPLOAD_SIGN_BATCH = 12;
export const DIRECT_UPLOAD_MAX_PARTS = 10_000;
export const DIRECT_UPLOAD_PREFIX_BYTES = UPLOAD_LIMITS.sniffBytes;
export const DIRECT_UPLOAD_IDLE_MS = 24 * 60 * 60 * 1_000;
export const DIRECT_UPLOAD_HARD_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;
export const DIRECT_UPLOAD_LEASE_MS = 5 * 60 * 1_000;
export const DIRECT_UPLOAD_PRESIGN_SECONDS = 10 * 60;

export type DirectUploadClassification = {
  kind: UploadKind;
  extension: string;
  contentType: string;
  disposition: ContentDisposition;
};

export type ObservedUploadPart = {
  partNumber: number;
  byteSize: number;
  eTag: string;
};

export type DirectUploadStateValue =
  | "CREATING"
  | "UPLOADING"
  | "VERIFYING"
  | "PUBLISHED"
  | "ABORTING"
  | "ABORTED"
  | "FAILED";

const VIDEO_TYPES = new Map<string, { extension: string; contentType: string }>(
  [
    ["mp4", { extension: "mp4", contentType: "video/mp4" }],
    ["webm", { extension: "webm", contentType: "video/webm" }],
    ["mov", { extension: "mov", contentType: "video/quicktime" }],
  ],
);

const IMAGE_EXTENSIONS = new Set(["jpg", "png", "webp", "avif", "gif"]);

const LEGAL_TRANSITIONS: Readonly<
  Record<DirectUploadStateValue, ReadonlySet<DirectUploadStateValue>>
> = {
  CREATING: new Set(["UPLOADING", "ABORTING", "FAILED"]),
  UPLOADING: new Set(["VERIFYING", "ABORTING", "FAILED"]),
  VERIFYING: new Set(["PUBLISHED", "ABORTING", "FAILED"]),
  PUBLISHED: new Set(),
  ABORTING: new Set(["ABORTED", "FAILED"]),
  ABORTED: new Set(),
  FAILED: new Set(["ABORTING"]),
};

export function canTransitionDirectUpload(
  from: DirectUploadStateValue,
  to: DirectUploadStateValue,
): boolean {
  return LEGAL_TRANSITIONS[from].has(to);
}

export function directUploadPartCount(
  byteSize: number,
  partSize = DIRECT_UPLOAD_PART_BYTES,
): number {
  if (!Number.isSafeInteger(byteSize) || byteSize < 1) {
    throw new TypeError("Upload byte size must be a positive safe integer");
  }
  if (!Number.isSafeInteger(partSize) || partSize < 5 * 1024 * 1024) {
    throw new TypeError("Multipart part size is below the S3 minimum");
  }
  return Math.ceil(byteSize / partSize);
}

export function directUploadPlan(byteSize: number, maximumBytes: number) {
  if (
    !Number.isSafeInteger(byteSize) ||
    byteSize <= UPLOAD_LIMITS.generic ||
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes <= UPLOAD_LIMITS.generic ||
    byteSize > maximumBytes
  ) {
    throw new DomainError("payload_too_large", {
      message: `Direct uploads must be larger than ${UPLOAD_LIMITS.generic / (1024 * 1024)} MiB and no larger than ${Math.floor(maximumBytes / (1024 * 1024))} MiB.`,
    });
  }
  const partCount = directUploadPartCount(byteSize);
  if (partCount > DIRECT_UPLOAD_MAX_PARTS) {
    throw new DomainError("payload_too_large");
  }
  return { byteSize, partSize: DIRECT_UPLOAD_PART_BYTES, partCount } as const;
}

export function expectedDirectUploadPartBytes(input: {
  byteSize: number;
  partSize: number;
  partCount: number;
  partNumber: number;
}): number {
  if (
    !Number.isInteger(input.partNumber) ||
    input.partNumber < 1 ||
    input.partNumber > input.partCount
  ) {
    throw new DomainError("invalid_input", {
      message: "The upload part number is invalid.",
    });
  }
  return input.partNumber === input.partCount
    ? input.byteSize - input.partSize * (input.partCount - 1)
    : input.partSize;
}

export function validateObservedUploadParts(input: {
  byteSize: number;
  partSize: number;
  partCount: number;
  parts: ReadonlyArray<ObservedUploadPart>;
}): ObservedUploadPart[] {
  if (input.parts.length !== input.partCount) {
    throw new DomainError("conflict", {
      message: "Not every upload part has reached object storage yet.",
    });
  }

  const ordered = [...input.parts].sort(
    (left, right) => left.partNumber - right.partNumber,
  );
  let total = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    const part = ordered[index]!;
    const partNumber = index + 1;
    const expectedBytes = expectedDirectUploadPartBytes({
      ...input,
      partNumber,
    });
    if (
      part.partNumber !== partNumber ||
      part.byteSize !== expectedBytes ||
      part.eTag.length < 1 ||
      part.eTag.length > 1_024
    ) {
      throw new DomainError("conflict", {
        message: "Object storage reported an invalid upload-part manifest.",
      });
    }
    total += part.byteSize;
  }
  if (total !== input.byteSize) {
    throw new DomainError("conflict", {
      message: "The uploaded part sizes do not match the declared file size.",
    });
  }
  return ordered;
}

export function validateDirectPartNumbers(
  values: ReadonlyArray<number>,
  partCount: number,
): number[] {
  if (values.length < 1 || values.length > DIRECT_UPLOAD_SIGN_BATCH) {
    throw new DomainError("invalid_input", {
      message: `Request between 1 and ${DIRECT_UPLOAD_SIGN_BATCH} upload parts at a time.`,
    });
  }
  const unique = new Set<number>();
  for (const value of values) {
    if (!Number.isInteger(value) || value < 1 || value > partCount) {
      throw new DomainError("invalid_input", {
        message: "The upload part number is invalid.",
      });
    }
    unique.add(value);
  }
  if (unique.size !== values.length) {
    throw new DomainError("invalid_input", {
      message: "Upload part numbers must be unique.",
    });
  }
  return [...unique].sort((left, right) => left - right);
}

export async function classifyDirectUploadPrefix(
  prefix: Uint8Array,
): Promise<DirectUploadClassification> {
  if (prefix.byteLength < 1 || prefix.byteLength > DIRECT_UPLOAD_PREFIX_BYTES) {
    throw new DomainError("invalid_input", {
      message: "The upload prefix is invalid.",
    });
  }

  let detected: Awaited<ReturnType<typeof fileTypeFromBuffer>>;
  try {
    detected = await fileTypeFromBuffer(prefix);
  } catch {
    detected = undefined;
  }
  if (detected && IMAGE_EXTENSIONS.has(detected.ext)) {
    throw new DomainError("payload_too_large", {
      message: "Images remain limited to 16 MiB.",
    });
  }
  const video = detected ? VIDEO_TYPES.get(detected.ext) : undefined;
  if (video) {
    return {
      kind: "VIDEO",
      ...video,
      disposition: "INLINE",
    };
  }
  return {
    kind: "FILE",
    extension:
      detected && /^[a-z0-9]{1,10}$/u.test(detected.ext) ? detected.ext : "bin",
    contentType: "application/octet-stream",
    disposition: "ATTACHMENT",
  };
}

export function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/u.test(value);
}
