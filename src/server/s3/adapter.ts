import type { S3ErrorCode } from "./errors";
import type { S3Operation } from "./constants";

export type S3RequestContext = Readonly<{
  operation: S3Operation;
  requestId: string;
  sourceAddress: string | null;
}>;

export type S3SigningCredential = Readonly<{
  accessKeyId: string;
  credentialId: string;
  maximumObjectBytes: number;
  principalId: string;
  secretKey: string | Uint8Array;
}>;

export type S3AuthorizationInput = Readonly<{
  bucket: string;
  contentLength: number | null;
  contentType: string;
  credential: S3SigningCredential;
  key: string | null;
  request: S3RequestContext;
}>;

export type S3PutObjectInput = Readonly<{
  bucket: string;
  byteSize: number;
  contentType: string;
  credential: S3SigningCredential;
  key: string;
  request: S3RequestContext;
  sha256Hex: string;
  temporaryFilePath: string;
}>;

export type S3ObjectReference = Readonly<{
  bucket: string;
  credential: S3SigningCredential;
  key: string;
  request: S3RequestContext;
}>;

export type S3ObjectMetadata = Readonly<{
  byteSize: number;
  contentType: string;
  etag: string;
  lastModified: Date;
  versionId?: string;
}>;

export type S3PutObjectResult = Readonly<{
  versionId?: string;
}>;

export interface S3GatewayAdapter {
  authorizeOperation(input: S3AuthorizationInput): Promise<void>;
  deleteObject(input: S3ObjectReference): Promise<void>;
  headBucket(input: {
    bucket: string;
    credential: S3SigningCredential;
    request: S3RequestContext;
  }): Promise<boolean>;
  headObject(input: S3ObjectReference): Promise<S3ObjectMetadata | null>;
  putObject(input: S3PutObjectInput): Promise<S3PutObjectResult>;
  resolveCredential(input: {
    accessKeyId: string;
    request: S3RequestContext;
  }): Promise<S3SigningCredential | null>;
}

export class S3AdapterError extends Error {
  readonly code: S3ErrorCode;
  readonly status?: number;

  constructor(
    code: S3ErrorCode,
    message: string,
    options?: { cause?: unknown; status?: number },
  ) {
    super(message, { cause: options?.cause });
    this.name = "S3AdapterError";
    this.code = code;
    this.status = options?.status;
  }
}
