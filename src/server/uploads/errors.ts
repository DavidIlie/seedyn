export type DomainErrorCode =
  | "invalid_input"
  | "missing_file"
  | "payload_too_large"
  | "unsupported_media"
  | "not_found"
  | "conflict"
  | "variant_exists"
  | "storage_unavailable"
  | "database_unavailable"
  | "request_timeout"
  | "request_aborted"
  | "internal";

const defaults = {
  invalid_input: { status: 400, message: "The request is invalid." },
  missing_file: {
    status: 400,
    message: "The request does not contain a file.",
  },
  payload_too_large: {
    status: 413,
    message: "The upload exceeds the permitted size.",
  },
  unsupported_media: {
    status: 415,
    message: "The uploaded bytes do not match the required media type.",
  },
  not_found: { status: 404, message: "The requested item was not found." },
  conflict: {
    status: 409,
    message: "The request conflicts with existing data.",
  },
  variant_exists: { status: 409, message: "A GIF variant already exists." },
  storage_unavailable: {
    status: 503,
    message: "Object storage is temporarily unavailable.",
  },
  database_unavailable: {
    status: 503,
    message: "The database is temporarily unavailable.",
  },
  request_timeout: { status: 408, message: "The upload timed out." },
  request_aborted: { status: 400, message: "The upload was cancelled." },
  internal: { status: 500, message: "An internal error occurred." },
} as const satisfies Record<
  DomainErrorCode,
  { status: number; message: string }
>;

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly status: number;

  constructor(
    code: DomainErrorCode,
    options?: { message?: string; cause?: unknown },
  ) {
    const definition = defaults[code];
    super(options?.message ?? definition.message, { cause: options?.cause });
    this.name = "DomainError";
    this.code = code;
    this.status = definition.status;
  }
}

export function asDomainError(error: unknown): DomainError {
  return error instanceof DomainError
    ? error
    : new DomainError("internal", { cause: error });
}

export function safeErrorCategory(error: unknown): string {
  if (error instanceof DomainError) return error.code;
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = Reflect.get(error, "code");
    if (typeof code === "string" && /^[A-Z0-9_]{1,40}$/.test(code)) return code;
  }
  return "unknown";
}
