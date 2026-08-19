import "server-only";

import { open } from "node:fs/promises";

import { db } from "~/server/db";
import {
  resolveS3Credential,
  type ResolvedS3Credential,
} from "~/server/api-keys/s3-credentials";
import type { ApiKeyScope } from "~/server/api-keys/constants";
import {
  checkAuthenticatedUploadRateLimit,
  checkAuthenticationRateLimit,
} from "~/server/http/request";
import {
  classifyUpload,
  type UploadKindValue,
} from "~/server/uploads/classification";
import { DomainError } from "~/server/uploads/errors";
import {
  UPLOAD_LIMITS,
  type ParsedUploadFile,
} from "~/server/uploads/multipart";
import { createUpload, deleteOwnedUpload } from "~/server/uploads/service";

import {
  S3AdapterError,
  type S3GatewayAdapter,
  type S3SigningCredential,
} from "./adapter";

const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1_000;

function rateLimitError(
  result: Exclude<
    Awaited<ReturnType<typeof checkAuthenticationRateLimit>>,
    { allowed: true }
  >,
): S3AdapterError {
  return result.reason === "rate_limited"
    ? new S3AdapterError("SlowDown", "Please reduce your request rate.", {
        status: 503,
      })
    : new S3AdapterError(
        "ServiceUnavailable",
        "Request protection is temporarily unavailable.",
      );
}

function domainAdapterError(error: DomainError): S3AdapterError {
  switch (error.code) {
    case "payload_too_large":
      return new S3AdapterError("EntityTooLarge", error.message);
    case "storage_quota_exceeded":
      return new S3AdapterError("AccessDenied", error.message);
    case "invalid_input":
    case "missing_file":
    case "unsupported_media":
      return new S3AdapterError("InvalidArgument", error.message, {
        status: error.status,
      });
    case "not_found":
      return new S3AdapterError("NoSuchKey", "The object does not exist.");
    case "conflict":
    case "variant_exists":
      return new S3AdapterError(
        "InvalidRequest",
        "An object already exists at this key.",
        { status: 409 },
      );
    case "request_timeout":
    case "request_aborted":
      return new S3AdapterError("RequestTimeout", error.message);
    case "database_unavailable":
    case "storage_unavailable":
      return new S3AdapterError("ServiceUnavailable", error.message);
    case "internal":
      return new S3AdapterError(
        "InternalError",
        "The object operation failed.",
      );
    default:
      return new S3AdapterError(
        "InternalError",
        "The object operation failed.",
      );
  }
}

function requiredScope(kind: UploadKindValue): ApiKeyScope {
  if (kind === "IMAGE") return "upload:image";
  if (kind === "TEXT") return "upload:text";
  return "upload:file";
}

function sameCredential(
  stored: ResolvedS3Credential | null,
  request: S3SigningCredential,
): stored is ResolvedS3Credential {
  return (
    stored !== null &&
    stored.apiKeyId === request.credentialId &&
    stored.userId === request.principalId &&
    stored.accessKeyId === request.accessKeyId
  );
}

async function activeCredential(
  credential: S3SigningCredential,
): Promise<ResolvedS3Credential> {
  const stored = await resolveS3Credential(credential.accessKeyId);
  if (!sameCredential(stored, credential)) {
    throw new S3AdapterError(
      "InvalidAccessKeyId",
      "The access key ID does not exist or is inactive.",
    );
  }
  return stored;
}

async function touchApiKey(apiKeyId: string): Promise<void> {
  const now = new Date();
  const writeBefore = new Date(now.getTime() - LAST_USED_WRITE_INTERVAL_MS);
  await db.apiKey.updateMany({
    where: {
      id: apiKeyId,
      revokedAt: null,
      OR: [{ lastUsedAt: null }, { lastUsedAt: { lte: writeBefore } }],
    },
    data: { lastUsedAt: now },
  });
}

async function sniffPrefix(
  path: string,
  byteSize: number,
): Promise<Uint8Array> {
  const length = Math.min(byteSize, UPLOAD_LIMITS.sniffBytes);
  const bytes = Buffer.alloc(length);
  const handle = await open(path, "r");
  try {
    const result = await handle.read(bytes, 0, length, 0);
    return bytes.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
}

function originalName(key: string): string {
  return key.split("/").at(-1) ?? "upload";
}

function sha256Equals(stored: Uint8Array, candidateHex: string): boolean {
  return Buffer.from(stored).equals(Buffer.from(candidateHex, "hex"));
}

export const seedynS3GatewayAdapter: S3GatewayAdapter = {
  async resolveCredential(input) {
    if (!input.request.sourceAddress) {
      throw new S3AdapterError(
        "ServiceUnavailable",
        "Request protection is temporarily unavailable.",
      );
    }
    const limit = await checkAuthenticationRateLimit({
      candidate: input.accessKeyId,
      sourceAddress: input.request.sourceAddress,
    });
    if (!limit.allowed) throw rateLimitError(limit);

    const credential = await resolveS3Credential(input.accessKeyId);
    if (!credential) return null;
    return {
      accessKeyId: credential.accessKeyId,
      credentialId: credential.apiKeyId,
      maximumObjectBytes: credential.scopes.includes("upload:file")
        ? UPLOAD_LIMITS.generic
        : UPLOAD_LIMITS.imageOrText,
      principalId: credential.userId,
      secretKey: credential.secretAccessKey,
    };
  },

  async authorizeOperation(input) {
    const credential = await activeCredential(input.credential);
    if (input.request.operation === "PutObject") {
      const sourceAddress = input.request.sourceAddress;
      if (!sourceAddress) {
        throw new S3AdapterError(
          "ServiceUnavailable",
          "Request protection is temporarily unavailable.",
        );
      }
      const limit = await checkAuthenticatedUploadRateLimit({
        userId: credential.userId,
        sourceAddress,
      });
      if (!limit.allowed) throw rateLimitError(limit);
    }
    await touchApiKey(credential.apiKeyId);
  },

  async headBucket(input) {
    await activeCredential(input.credential);
    return input.bucket === "seedyn";
  },

  async putObject(input) {
    const credential = await activeCredential(input.credential);
    const existing = await db.upload.findFirst({
      where: {
        userId: credential.userId,
        state: "READY",
        s3PublicNamespaceSnapshot: credential.publicNamespace,
        s3ObjectKey: input.key,
      },
      select: { sha256: true },
    });
    if (existing) {
      if (sha256Equals(existing.sha256, input.sha256Hex)) return {};
      throw new S3AdapterError(
        "InvalidRequest",
        "An object already exists at this key.",
        { status: 409 },
      );
    }

    const file: ParsedUploadFile = {
      fieldName: "file",
      originalName: originalName(input.key),
      claimedContentType: input.contentType,
      path: input.temporaryFilePath,
      byteSize: input.byteSize,
      sha256Hex: input.sha256Hex,
      sniffPrefix: await sniffPrefix(input.temporaryFilePath, input.byteSize),
      fields: {},
      // The gateway owns and removes the spool after this adapter returns.
      dispose: async () => undefined,
    };

    try {
      const classification = await classifyUpload(file, {
        forcedKind: "auto",
      });
      const scope = requiredScope(classification.kind);
      if (!credential.scopes.includes(scope)) {
        throw new S3AdapterError(
          "AccessDenied",
          "The API key does not permit this upload type.",
        );
      }
      await createUpload({
        userId: credential.userId,
        file,
        classification,
        forcedKind: "auto",
        signal: undefined,
        provenance: {
          origin: "S3",
          credential: {
            id: credential.apiKeyId,
            name: credential.apiKeyName,
            clientLabel: credential.clientLabel,
          },
          s3: {
            objectKey: input.key,
            publicNamespace: credential.publicNamespace,
          },
        },
      });
      return {};
    } catch (error) {
      if (error instanceof S3AdapterError) throw error;
      if (error instanceof DomainError) throw domainAdapterError(error);
      throw new S3AdapterError(
        "InternalError",
        "The object operation failed.",
        { cause: error },
      );
    }
  },

  async headObject(input) {
    const credential = await activeCredential(input.credential);
    const upload = await db.upload.findFirst({
      where: {
        userId: credential.userId,
        state: "READY",
        s3PublicNamespaceSnapshot: credential.publicNamespace,
        s3ObjectKey: input.key,
      },
      select: {
        byteSize: true,
        contentType: true,
        createdAt: true,
        sha256: true,
      },
    });
    if (!upload) return null;
    const byteSize = Number(upload.byteSize);
    if (!Number.isSafeInteger(byteSize)) {
      throw new S3AdapterError(
        "InternalError",
        "Stored object metadata is invalid.",
      );
    }
    return {
      byteSize,
      contentType: upload.contentType,
      etag: Buffer.from(upload.sha256).toString("hex"),
      lastModified: upload.createdAt,
    };
  },

  async deleteObject(input) {
    const credential = await activeCredential(input.credential);
    const upload = await db.upload.findFirst({
      where: {
        userId: credential.userId,
        s3PublicNamespaceSnapshot: credential.publicNamespace,
        s3ObjectKey: input.key,
      },
      select: { id: true },
    });
    // S3 DeleteObject is idempotent.
    if (!upload) return;
    try {
      await deleteOwnedUpload({
        userId: credential.userId,
        uploadId: upload.id,
      });
    } catch (error) {
      if (error instanceof DomainError && error.code === "not_found") return;
      if (error instanceof DomainError) throw domainAdapterError(error);
      throw new S3AdapterError(
        "InternalError",
        "The object operation failed.",
        { cause: error },
      );
    }
  },
};
