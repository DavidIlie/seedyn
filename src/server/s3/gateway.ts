import "server-only";

import type {
  S3GatewayAdapter,
  S3ObjectMetadata,
  S3SigningCredential,
} from "./adapter";
import { S3AdapterError } from "./adapter";
import {
  S3_FIXED_BUCKET,
  S3_MAX_OBJECT_BYTES,
  type S3Operation,
} from "./constants";
import { internalS3Error, S3ProtocolError, type S3ErrorCode } from "./errors";
import { parseSigV4Candidate, verifySigV4 } from "./sigv4";
import { spoolAndVerifyPayload } from "./spool";
import {
  canonicalBucketUri,
  canonicalObjectUri,
  parseSafeObjectKey,
} from "./target";
import { createS3RequestId, s3ErrorResponse, s3ResponseHeaders } from "./xml";

type S3Method = "DELETE" | "HEAD" | "PUT";

export type S3GatewayRequest = Readonly<{
  adapter: S3GatewayAdapter | null;
  keyParts?: readonly string[];
  method: S3Method;
  operation: S3Operation;
  request: Request;
  sourceAddress: string | null;
}>;

function requestResource(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "/";
  }
}

function contentLength(request: Request): number {
  const value = request.headers.get("content-length");
  if (value === null || !/^(?:0|[1-9]\d{0,15})$/u.test(value)) {
    throw new S3ProtocolError(
      "InvalidRequest",
      "A valid Content-Length header is required.",
    );
  }
  const length = Number(value);
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new S3ProtocolError(
      "InvalidRequest",
      "A valid Content-Length header is required.",
    );
  }
  return length;
}

export async function assertBodylessRequest(request: Request): Promise<void> {
  const value = request.headers.get("content-length");
  if (value !== null && value !== "0") {
    throw new S3ProtocolError(
      "InvalidRequest",
      "This operation does not accept a request body.",
    );
  }
  if (value === "0" || request.body === null) return;

  // CFNetwork gives Next an already-empty stream for Shottr's DELETE even
  // though the request has no Content-Length header. Inspect that stream
  // instead of treating its mere presence as a body.
  const reader = request.body.getReader();
  try {
    for (;;) {
      const { done, value: chunk } = await reader.read();
      if (done) return;
      if (chunk.byteLength > 0) {
        throw new S3ProtocolError(
          "InvalidRequest",
          "This operation does not accept a request body.",
        );
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function adapterFailure(error: S3AdapterError): S3ProtocolError {
  return new S3ProtocolError(error.code, error.message, {
    cause: error,
    status: error.status,
  });
}

async function resolveCredential(
  adapter: S3GatewayAdapter,
  accessKeyId: string,
  context: {
    operation: S3Operation;
    requestId: string;
    sourceAddress: string | null;
  },
): Promise<S3SigningCredential | null> {
  try {
    const credential = await adapter.resolveCredential({
      accessKeyId,
      request: context,
    });
    if (credential !== null && credential.accessKeyId !== accessKeyId) {
      throw internalS3Error();
    }
    return credential;
  } catch (error) {
    if (error instanceof S3AdapterError) throw adapterFailure(error);
    if (error instanceof S3ProtocolError) throw error;
    throw internalS3Error(error);
  }
}

async function authorize(
  adapter: S3GatewayAdapter,
  input: Parameters<S3GatewayAdapter["authorizeOperation"]>[0],
): Promise<void> {
  try {
    await adapter.authorizeOperation(input);
  } catch (error) {
    if (error instanceof S3AdapterError) throw adapterFailure(error);
    throw internalS3Error(error);
  }
}

function secretBytes(credential: S3SigningCredential | null): Buffer | null {
  if (!credential) return null;
  const secret =
    typeof credential.secretKey === "string"
      ? Buffer.from(credential.secretKey, "utf8")
      : Buffer.from(credential.secretKey);
  if (secret.byteLength < 32 || secret.byteLength > 256) {
    secret.fill(0);
    throw internalS3Error();
  }
  return secret;
}

function safeHeaderValue(value: string, errorCode: S3ErrorCode): string {
  if (value.length === 0 || value.length > 256 || /[\r\n\0]/u.test(value)) {
    throw new S3ProtocolError(errorCode, "Stored object metadata is invalid.");
  }
  return value;
}

function quotedEtag(value: string): string {
  const normalized =
    value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
  if (!/^[A-Za-z0-9._:-]{1,128}$/u.test(normalized)) {
    throw internalS3Error();
  }
  return `"${normalized}"`;
}

function objectHeadResponse(
  metadata: S3ObjectMetadata,
  requestId: string,
): Response {
  if (
    !Number.isSafeInteger(metadata.byteSize) ||
    metadata.byteSize < 0 ||
    !Number.isFinite(metadata.lastModified.getTime())
  ) {
    throw internalS3Error();
  }
  const headers = s3ResponseHeaders(requestId);
  headers.set("Content-Length", String(metadata.byteSize));
  headers.set(
    "Content-Type",
    safeHeaderValue(metadata.contentType, "InternalError"),
  );
  headers.set("ETag", quotedEtag(metadata.etag));
  headers.set("Last-Modified", metadata.lastModified.toUTCString());
  if (metadata.versionId) {
    headers.set(
      "X-Amz-Version-Id",
      safeHeaderValue(metadata.versionId, "InternalError"),
    );
  }
  return new Response(null, { status: 200, headers });
}

async function executeOperation(input: {
  adapter: S3GatewayAdapter;
  credential: S3SigningCredential;
  key: string | null;
  request: Request;
  requestContext: {
    operation: S3Operation;
    requestId: string;
    sourceAddress: string | null;
  };
  payloadSha256: string;
  region: string;
}): Promise<Response> {
  if (input.requestContext.operation === "HeadBucket") {
    await assertBodylessRequest(input.request);
    await authorize(input.adapter, {
      bucket: S3_FIXED_BUCKET,
      contentLength: null,
      contentType: "application/octet-stream",
      credential: input.credential,
      key: null,
      request: input.requestContext,
    });
    let exists;
    try {
      exists = await input.adapter.headBucket({
        bucket: S3_FIXED_BUCKET,
        credential: input.credential,
        request: input.requestContext,
      });
    } catch (error) {
      if (error instanceof S3AdapterError) throw adapterFailure(error);
      throw internalS3Error(error);
    }
    if (!exists) {
      throw new S3ProtocolError(
        "NoSuchBucket",
        "The specified bucket does not exist.",
      );
    }
    const headers = s3ResponseHeaders(input.requestContext.requestId);
    headers.set("X-Amz-Bucket-Region", input.region);
    return new Response(null, { status: 200, headers });
  }

  if (input.key === null) throw internalS3Error();
  if (input.requestContext.operation === "PutObject") {
    const length = contentLength(input.request);
    await authorize(input.adapter, {
      bucket: S3_FIXED_BUCKET,
      contentLength: length,
      contentType: "application/octet-stream",
      credential: input.credential,
      key: input.key,
      request: input.requestContext,
    });
    const credentialMaximum = input.credential.maximumObjectBytes;
    if (!Number.isSafeInteger(credentialMaximum) || credentialMaximum < 0) {
      throw internalS3Error();
    }
    const payload = await spoolAndVerifyPayload({
      contentLength: length,
      expectedSha256: input.payloadSha256,
      maximumBytes: Math.min(credentialMaximum, S3_MAX_OBJECT_BYTES),
      request: input.request,
    });
    try {
      let result;
      try {
        result = await input.adapter.putObject({
          bucket: S3_FIXED_BUCKET,
          byteSize: payload.byteSize,
          contentType: "application/octet-stream",
          credential: input.credential,
          key: input.key,
          request: input.requestContext,
          sha256Hex: payload.sha256Hex,
          temporaryFilePath: payload.path,
        });
      } catch (error) {
        if (error instanceof S3AdapterError) throw adapterFailure(error);
        throw internalS3Error(error);
      }
      const headers = s3ResponseHeaders(input.requestContext.requestId);
      headers.set("Content-Length", "0");
      headers.set("ETag", quotedEtag(payload.sha256Hex));
      if (result.versionId) {
        headers.set(
          "X-Amz-Version-Id",
          safeHeaderValue(result.versionId, "InternalError"),
        );
      }
      return new Response(null, { status: 200, headers });
    } finally {
      await payload.dispose().catch(() => undefined);
    }
  }

  await assertBodylessRequest(input.request);
  await authorize(input.adapter, {
    bucket: S3_FIXED_BUCKET,
    contentLength: null,
    contentType: "application/octet-stream",
    credential: input.credential,
    key: input.key,
    request: input.requestContext,
  });
  if (input.requestContext.operation === "HeadObject") {
    let metadata;
    try {
      metadata = await input.adapter.headObject({
        bucket: S3_FIXED_BUCKET,
        credential: input.credential,
        key: input.key,
        request: input.requestContext,
      });
    } catch (error) {
      if (error instanceof S3AdapterError) throw adapterFailure(error);
      throw internalS3Error(error);
    }
    if (!metadata) {
      throw new S3ProtocolError(
        "NoSuchKey",
        "The specified key does not exist.",
      );
    }
    return objectHeadResponse(metadata, input.requestContext.requestId);
  }
  try {
    await input.adapter.deleteObject({
      bucket: S3_FIXED_BUCKET,
      credential: input.credential,
      key: input.key,
      request: input.requestContext,
    });
  } catch (error) {
    if (error instanceof S3AdapterError) throw adapterFailure(error);
    throw internalS3Error(error);
  }
  return new Response(null, {
    status: 204,
    headers: s3ResponseHeaders(input.requestContext.requestId),
  });
}

export async function handleS3GatewayRequest(
  input: S3GatewayRequest,
): Promise<Response> {
  const startedAt = Date.now();
  const response = await handleS3GatewayRequestInternal(input);
  if (
    process.env.CDN_URL &&
    process.env.APP_HOSTS &&
    process.env.REDIS_URL &&
    process.env.MINIO_BUCKET
  ) {
    const { recordAuditEvent } = await import("~/server/audit/service");
    await recordAuditEvent({
      category: "API",
      action: "s3_request",
      outcome: response.ok
        ? "SUCCESS"
        : response.status === 401 || response.status === 403
          ? "DENIED"
          : "FAILURE",
      actorType: input.request.headers.has("authorization")
        ? "API_KEY"
        : "ANONYMOUS",
      method: input.method,
      route: input.keyParts ? "/seedyn/:key" : "/seedyn",
      statusCode: response.status,
      metadata: {
        operation: input.operation,
        durationMs: Date.now() - startedAt,
      },
    });
  }
  return response;
}

async function handleS3GatewayRequestInternal(
  input: S3GatewayRequest,
): Promise<Response> {
  const requestId = createS3RequestId();
  const resource = requestResource(input.request);
  try {
    if (!input.adapter) {
      throw new S3ProtocolError(
        "ServiceUnavailable",
        "The S3 integration is not configured.",
      );
    }
    const key = input.keyParts ? parseSafeObjectKey(input.keyParts) : null;
    const canonicalUri = key
      ? canonicalObjectUri(input.request, key)
      : canonicalBucketUri(input.request);
    const candidate = parseSigV4Candidate(input.request);
    const requestContext = {
      operation: input.operation,
      requestId,
      sourceAddress: input.sourceAddress,
    } as const;
    const credential = await resolveCredential(
      input.adapter,
      candidate.accessKeyId,
      requestContext,
    );
    const secret = secretBytes(credential);
    try {
      verifySigV4({
        candidate,
        canonicalUri,
        credentialSecret: secret,
        method: input.method,
        operation: input.operation,
        request: input.request,
      });
    } finally {
      secret?.fill(0);
    }
    if (!credential) throw internalS3Error();
    return await executeOperation({
      adapter: input.adapter,
      credential,
      key,
      request: input.request,
      requestContext,
      payloadSha256: candidate.payloadSha256,
      region: candidate.region,
    });
  } catch (error) {
    const protocolError =
      error instanceof S3ProtocolError ? error : internalS3Error(error);
    return s3ErrorResponse({
      error: protocolError,
      head: input.method === "HEAD",
      requestId,
      resource,
    });
  }
}
