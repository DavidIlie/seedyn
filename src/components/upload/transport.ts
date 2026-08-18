import { UPLOAD_FILE_FIELD } from "./endpoints";

/**
 * Multipart POST with real progress and a real abort.
 *
 * `XMLHttpRequest` rather than `fetch` deliberately: `upload.onprogress` is the
 * only browser API that reports bytes actually handed to the socket. A fetch
 * with a synthetic timer would be a lie, and the design rules forbid fake
 * progress.
 */

export class TransportError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TransportError";
    this.code = code;
  }
}

export type UploadedRecord = {
  id: string;
  kind?: string;
  contentType?: string;
  extension?: string;
  url: string;
};

type ErrorEnvelope = {
  error?: { code?: unknown; message?: unknown };
};

function readEnvelope(status: number, body: string): TransportError {
  try {
    const parsed = JSON.parse(body) as ErrorEnvelope;
    const code = parsed.error?.code;
    const message = parsed.error?.message;
    if (typeof message === "string" && message.length > 0) {
      return new TransportError(
        typeof code === "string" ? code : `http_${status}`,
        message,
      );
    }
  } catch {
    // A non-JSON body means something upstream of the application answered.
  }
  if (status === 401) {
    return new TransportError(
      "unauthenticated",
      "Your session expired. Sign in again and retry.",
    );
  }
  if (status === 413) {
    return new TransportError("payload_too_large", "That file is too large.");
  }
  return new TransportError(
    `http_${status}`,
    `The server rejected the upload (HTTP ${status}).`,
  );
}

function readRecord(body: string): UploadedRecord {
  const parsed: unknown = JSON.parse(body);
  if (typeof parsed !== "object" || parsed === null) {
    throw new TransportError("invalid_response", "The server sent no upload.");
  }
  const record = parsed as Record<string, unknown>;
  const upload =
    typeof record.upload === "object" && record.upload !== null
      ? (record.upload as Record<string, unknown>)
      : null;
  const url = typeof record.url === "string" ? record.url : record.message;
  if (typeof url !== "string" || url.length === 0) {
    throw new TransportError("invalid_response", "The server sent no URL.");
  }
  return {
    id: typeof record.id === "string" ? record.id : "",
    kind:
      typeof upload?.kind === "string"
        ? upload.kind
        : typeof record.kind === "string"
          ? record.kind
          : undefined,
    contentType:
      typeof upload?.contentType === "string" ? upload.contentType : undefined,
    extension:
      typeof upload?.extension === "string" ? upload.extension : undefined,
    url,
  };
}

export function postMultipart(input: {
  endpoint: string;
  body: Blob;
  filename: string;
  fieldName?: string;
  signal: AbortSignal;
  /** `total` is null while the browser cannot compute a length. */
  onProgress: (loaded: number, total: number | null) => void;
}): Promise<UploadedRecord> {
  return new Promise((resolve, reject) => {
    if (input.signal.aborted) {
      reject(new TransportError("cancelled", "Upload cancelled."));
      return;
    }

    const form = new FormData();
    form.append(
      input.fieldName ?? UPLOAD_FILE_FIELD,
      input.body,
      input.filename,
    );

    const request = new XMLHttpRequest();
    request.open("POST", input.endpoint, true);
    request.responseType = "text";
    request.setRequestHeader("Accept", "application/json");

    const abort = () => request.abort();
    input.signal.addEventListener("abort", abort, { once: true });

    const settle = () => input.signal.removeEventListener("abort", abort);

    request.upload.addEventListener("progress", (event) => {
      input.onProgress(
        event.loaded,
        event.lengthComputable ? event.total : null,
      );
    });

    request.addEventListener("abort", () => {
      settle();
      reject(new TransportError("cancelled", "Upload cancelled."));
    });

    request.addEventListener("error", () => {
      settle();
      reject(
        new TransportError(
          "network",
          "The connection dropped before the upload finished.",
        ),
      );
    });

    request.addEventListener("load", () => {
      settle();
      const body =
        typeof request.responseText === "string" ? request.responseText : "";
      if (request.status < 200 || request.status >= 300) {
        reject(readEnvelope(request.status, body));
        return;
      }
      try {
        resolve(readRecord(body));
      } catch (error) {
        reject(
          error instanceof TransportError
            ? error
            : new TransportError(
                "invalid_response",
                "Unreadable server response.",
              ),
        );
      }
    });

    request.send(form);
  });
}
