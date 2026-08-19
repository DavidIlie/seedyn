import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import {
  S3_EMPTY_SHA256,
  S3_MAX_CLOCK_SKEW_MS,
  type S3Operation,
} from "./constants";
import { S3ProtocolError } from "./errors";

const ALGORITHM = "AWS4-HMAC-SHA256";
const AUTHORIZATION =
  /^AWS4-HMAC-SHA256 Credential=([A-Za-z0-9_-]{8,128})\/(\d{8})\/([a-z0-9-]{1,64})\/s3\/aws4_request, ?SignedHeaders=([a-z0-9-]+(?:;[a-z0-9-]+)*), ?Signature=([a-f0-9]{64})$/u;
const AMZ_DATE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/u;
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const REQUIRED_SIGNED_HEADERS = [
  "host",
  "x-amz-content-sha256",
  "x-amz-date",
] as const;
const PERMITTED_AMZ_HEADERS = new Set(["x-amz-content-sha256", "x-amz-date"]);
const DUMMY_SECRET = randomBytes(32);

export type SigV4Candidate = Readonly<{
  accessKeyId: string;
  amzDate: string;
  credentialDate: string;
  credentialScope: string;
  payloadSha256: string;
  region: string;
  requestTime: Date;
  signature: string;
  signedHeaders: readonly string[];
  signedHeadersValue: string;
}>;

function normalizeHeaderValue(value: string): string {
  if (/\r|\n|\0/u.test(value)) {
    throw new S3ProtocolError(
      "InvalidRequest",
      "A signed header contains an invalid value.",
    );
  }
  return value.trim().replace(/[\t ]+/gu, " ");
}

function parseRequestTime(value: string): Date {
  const match = AMZ_DATE.exec(value);
  if (!match) {
    throw new S3ProtocolError(
      "InvalidArgument",
      "The x-amz-date header is invalid.",
    );
  }
  const parts = match.slice(1).map(Number);
  const [year, month, day, hour, minute, second] = parts;
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined
  ) {
    throw new S3ProtocolError(
      "InvalidArgument",
      "The x-amz-date header is invalid.",
    );
  }
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    parsed.getUTCHours() !== hour ||
    parsed.getUTCMinutes() !== minute ||
    parsed.getUTCSeconds() !== second
  ) {
    throw new S3ProtocolError(
      "InvalidArgument",
      "The x-amz-date header is invalid.",
    );
  }
  return parsed;
}

function requireSignedHeader(request: Request, name: string): string {
  const value = request.headers.get(name);
  if (value === null || value.length === 0) {
    throw new S3ProtocolError(
      "InvalidRequest",
      `The required signed header ${name} is missing.`,
    );
  }
  return normalizeHeaderValue(value);
}

function assertSupportedHeaders(request: Request): void {
  for (const [name] of request.headers) {
    const normalized = name.toLowerCase();
    if (
      normalized.startsWith("x-amz-") &&
      !PERMITTED_AMZ_HEADERS.has(normalized)
    ) {
      throw new S3ProtocolError(
        "NotImplemented",
        `The header ${normalized} is not supported.`,
      );
    }
  }
  if (request.headers.has("transfer-encoding")) {
    throw new S3ProtocolError(
      "NotImplemented",
      "Streaming and chunked S3 payload signing are not supported.",
    );
  }
}

export function parseSigV4Candidate(request: Request): SigV4Candidate {
  assertSupportedHeaders(request);
  const authorization = request.headers.get("authorization");
  const match = authorization ? AUTHORIZATION.exec(authorization) : null;
  if (!match) {
    throw new S3ProtocolError(
      "AccessDenied",
      "AWS Signature Version 4 authentication is required.",
    );
  }
  const [, accessKeyId, credentialDate, region, signedHeadersValue, signature] =
    match;
  if (
    accessKeyId === undefined ||
    credentialDate === undefined ||
    region === undefined ||
    signedHeadersValue === undefined ||
    signature === undefined
  ) {
    throw new S3ProtocolError(
      "AccessDenied",
      "AWS Signature Version 4 authentication is required.",
    );
  }
  const signedHeaders = signedHeadersValue.split(";");
  const sortedHeaders = [...signedHeaders].sort();
  if (
    new Set(signedHeaders).size !== signedHeaders.length ||
    sortedHeaders.some((value, index) => value !== signedHeaders[index]) ||
    REQUIRED_SIGNED_HEADERS.some((name) => !signedHeaders.includes(name))
  ) {
    throw new S3ProtocolError(
      "InvalidRequest",
      "The signed header set is invalid.",
    );
  }
  const payloadSha256 = requireSignedHeader(request, "x-amz-content-sha256");
  if (!SHA256_HEX.test(payloadSha256)) {
    throw new S3ProtocolError(
      "InvalidArgument",
      "The x-amz-content-sha256 header is invalid.",
    );
  }
  const amzDate = requireSignedHeader(request, "x-amz-date");
  const host = requireSignedHeader(request, "host");
  if (
    !/^[A-Za-z0-9.-]+(?::(?:0|[1-9]\d{0,4}))?$/u.test(host) ||
    host.startsWith(".") ||
    host.endsWith(".") ||
    host.includes("..")
  ) {
    throw new S3ProtocolError(
      "InvalidRequest",
      "The signed host header is invalid.",
    );
  }
  if (!amzDate.startsWith(credentialDate)) {
    throw new S3ProtocolError(
      "InvalidRequest",
      "The credential date does not match x-amz-date.",
    );
  }
  return {
    accessKeyId,
    amzDate,
    credentialDate,
    credentialScope: `${credentialDate}/${region}/s3/aws4_request`,
    payloadSha256,
    region,
    requestTime: parseRequestTime(amzDate),
    signature,
    signedHeaders,
    signedHeadersValue,
  };
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: Uint8Array, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function signingKey(secret: Uint8Array, date: string, region: string): Buffer {
  const dateKey = hmac(
    Buffer.concat([Buffer.from("AWS4", "utf8"), Buffer.from(secret)]),
    date,
  );
  const regionKey = hmac(dateKey, region);
  dateKey.fill(0);
  const serviceKey = hmac(regionKey, "s3");
  regionKey.fill(0);
  const result = hmac(serviceKey, "aws4_request");
  serviceKey.fill(0);
  return result;
}

function canonicalHeaders(request: Request, names: readonly string[]): string {
  return names
    .map((name) => `${name}:${requireSignedHeader(request, name)}\n`)
    .join("");
}

export function verifySigV4(input: {
  candidate: SigV4Candidate;
  canonicalUri: string;
  credentialSecret: Uint8Array | null;
  method: "DELETE" | "HEAD" | "PUT";
  now?: Date;
  operation: S3Operation;
  request: Request;
}): void {
  const secret = input.credentialSecret ?? DUMMY_SECRET;
  const canonicalRequest = [
    input.method,
    input.canonicalUri,
    "",
    canonicalHeaders(input.request, input.candidate.signedHeaders),
    input.candidate.signedHeadersValue,
    input.candidate.payloadSha256,
  ].join("\n");
  const stringToSign = [
    ALGORITHM,
    input.candidate.amzDate,
    input.candidate.credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const key = signingKey(
    secret,
    input.candidate.credentialDate,
    input.candidate.region,
  );
  const expected = createHmac("sha256", key)
    .update(stringToSign, "utf8")
    .digest();
  key.fill(0);
  const provided = Buffer.from(input.candidate.signature, "hex");
  const valid = timingSafeEqual(expected, provided);
  expected.fill(0);
  provided.fill(0);
  if (input.credentialSecret === null) {
    throw new S3ProtocolError(
      "InvalidAccessKeyId",
      "The access key ID does not exist or is inactive.",
    );
  }
  if (!valid) {
    throw new S3ProtocolError(
      "SignatureDoesNotMatch",
      "The request signature does not match the calculated signature.",
    );
  }
  const now = input.now ?? new Date();
  if (
    Math.abs(now.getTime() - input.candidate.requestTime.getTime()) >
    S3_MAX_CLOCK_SKEW_MS
  ) {
    throw new S3ProtocolError(
      "RequestTimeTooSkewed",
      "The difference between the request time and the server time is too large.",
      {
        details: [
          { name: "RequestTime", value: input.candidate.amzDate },
          { name: "ServerTime", value: now.toISOString() },
          {
            name: "MaxAllowedSkewMilliseconds",
            value: String(S3_MAX_CLOCK_SKEW_MS),
          },
        ],
      },
    );
  }
  if (
    input.operation !== "PutObject" &&
    input.candidate.payloadSha256 !== S3_EMPTY_SHA256
  ) {
    throw new S3ProtocolError(
      "BadDigest",
      "Requests without a body must sign the empty SHA-256 digest.",
    );
  }
}
