export type S3ErrorCode =
  | "AccessDenied"
  | "BadDigest"
  | "EntityTooLarge"
  | "IncompleteBody"
  | "InternalError"
  | "InvalidAccessKeyId"
  | "InvalidArgument"
  | "InvalidBucketName"
  | "InvalidRequest"
  | "NoSuchBucket"
  | "NoSuchKey"
  | "NotImplemented"
  | "RequestTimeTooSkewed"
  | "RequestTimeout"
  | "ServiceUnavailable"
  | "SignatureDoesNotMatch"
  | "SlowDown";

const DEFAULT_STATUS: Readonly<Record<S3ErrorCode, number>> = {
  AccessDenied: 403,
  BadDigest: 400,
  EntityTooLarge: 413,
  IncompleteBody: 400,
  InternalError: 500,
  InvalidAccessKeyId: 403,
  InvalidArgument: 400,
  InvalidBucketName: 400,
  InvalidRequest: 400,
  NoSuchBucket: 404,
  NoSuchKey: 404,
  NotImplemented: 501,
  RequestTimeTooSkewed: 403,
  RequestTimeout: 408,
  ServiceUnavailable: 503,
  SignatureDoesNotMatch: 403,
  SlowDown: 503,
};

export type S3ErrorDetail = Readonly<{
  name: string;
  value: string;
}>;

export class S3ProtocolError extends Error {
  readonly code: S3ErrorCode;
  readonly status: number;
  readonly details: readonly S3ErrorDetail[];

  constructor(
    code: S3ErrorCode,
    message: string,
    options?: {
      cause?: unknown;
      details?: readonly S3ErrorDetail[];
      status?: number;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = "S3ProtocolError";
    this.code = code;
    this.status = options?.status ?? DEFAULT_STATUS[code];
    this.details = options?.details ?? [];
  }
}

export function internalS3Error(cause?: unknown): S3ProtocolError {
  return new S3ProtocolError(
    "InternalError",
    "We encountered an internal error. Please try again.",
    { cause },
  );
}
