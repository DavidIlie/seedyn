import { TransportError, type UploadedRecord } from "./transport";

const SIGN_BATCH_SIZE = 12;
const UPLOAD_CONCURRENCY = 3;
const RETRY_DELAYS_MS = [0, 1_000, 3_000, 5_000, 10_000, 30_000] as const;

type InitResponse = {
  sessionId: string;
  partSize: number;
  partCount: number;
  expiresAt: string;
};

type StatusResponse =
  | {
      state: "creating" | "uploading";
      uploadedBytes: number;
      uploadedParts: number[];
      expiresAt: string;
    }
  | { state: "verifying"; uploadedBytes: number; uploadedParts: number[] }
  | { state: "published"; record: UploadedRecord }
  | { state: "aborting" | "aborted" | "failed"; failureCode?: string };

type DirectTransferState =
  | { name: "preparing" }
  | { name: "uploading"; loaded: number; total: number }
  | { name: "paused"; loaded: number; total: number }
  | { name: "offline"; loaded: number; total: number }
  | { name: "verifying"; loaded: number; total: number };

export type DirectTransfer = {
  completion: Promise<UploadedRecord>;
  cancel(): void;
  pauseResume(): boolean | undefined;
};

type DirectTransferInput = {
  file: File;
  slug?: string;
  mediaDomain?: string;
  signal: AbortSignal;
  onState: (state: DirectTransferState) => void;
};

class PauseInterruption extends Error {}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
}

async function responseError(response: Response): Promise<TransportError> {
  try {
    const body = (await response.json()) as {
      error?: { code?: unknown; message?: unknown };
    };
    if (typeof body.error?.message === "string") {
      return new TransportError(
        typeof body.error.code === "string"
          ? body.error.code
          : `http_${response.status}`,
        body.error.message,
        response.status,
      );
    }
  } catch {
    // An edge or storage proxy can return a non-JSON failure body.
  }
  return new TransportError(
    `http_${response.status}`,
    `The upload request failed (HTTP ${response.status}).`,
    response.status,
  );
}

async function jsonRequest<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      ...init,
      headers,
    });
  } catch {
    throw new TransportError("network", "The connection to Seedyn was lost.");
  }
  if (!response.ok) throw await responseError(response);
  return (await response.json()) as T;
}

function hashFile(
  file: File,
  signal: AbortSignal,
): Promise<{ sha256: string; prefix: Uint8Array }> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new TransportError("cancelled", "Upload cancelled."));
      return;
    }
    const worker = new Worker(new URL("./hash-worker.ts", import.meta.url), {
      type: "module",
    });
    const cleanup = () => {
      signal.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      cleanup();
      reject(new TransportError("cancelled", "Upload cancelled."));
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (
      event: MessageEvent<{
        sha256?: string;
        prefix?: Uint8Array;
        error?: string;
      }>,
    ) => {
      cleanup();
      if (event.data.error || !event.data.sha256 || !event.data.prefix) {
        reject(
          new TransportError(
            "preparation_failed",
            event.data.error ?? "The browser could not prepare that file.",
          ),
        );
        return;
      }
      resolve({ sha256: event.data.sha256, prefix: event.data.prefix });
    };
    worker.onerror = () => {
      cleanup();
      reject(
        new TransportError(
          "preparation_failed",
          "The browser could not prepare that file.",
        ),
      );
    };
    worker.postMessage({ file });
  });
}

function putPart(input: {
  url: string;
  body: Blob;
  signal: AbortSignal;
  onProgress: (loaded: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", input.url, true);
    const abort = () => request.abort();
    const settle = () => input.signal.removeEventListener("abort", abort);
    input.signal.addEventListener("abort", abort, { once: true });
    request.upload.addEventListener("progress", (event) => {
      input.onProgress(event.loaded);
    });
    request.addEventListener("abort", () => {
      settle();
      reject(new PauseInterruption());
    });
    request.addEventListener("error", () => {
      settle();
      const error = new TransportError(
        "network",
        "The connection dropped while sending an upload part.",
        request.status,
      );
      reject(error);
    });
    request.addEventListener("load", () => {
      settle();
      if (request.status < 200 || request.status >= 300) {
        const error = new TransportError(
          `storage_${request.status}`,
          `Object storage rejected an upload part (HTTP ${request.status}).`,
          request.status,
        );
        reject(error);
        return;
      }
      if (!request.getResponseHeader("etag")) {
        reject(
          new TransportError(
            "storage_cors",
            "Object storage did not expose ETag. Check the bucket CORS policy.",
          ),
        );
        return;
      }
      input.onProgress(input.body.size);
      resolve();
    });
    request.send(input.body);
  });
}

class MultipartScheduler {
  readonly #file: File;
  readonly #session: InitResponse;
  readonly #onState: DirectTransferInput["onState"];
  readonly #completed = new Set<number>();
  readonly #signed = new Map<number, string>();
  readonly #active = new Map<number, AbortController>();
  readonly #progress = new Map<number, number>();
  #publishedRecord: UploadedRecord | undefined;
  #paused = false;
  #offline = false;
  #cancelled = false;
  #verifying = false;
  readonly #waiters = new Set<() => void>();

  constructor(input: {
    file: File;
    session: InitResponse;
    onState: DirectTransferInput["onState"];
  }) {
    this.#file = input.file;
    this.#session = input.session;
    this.#onState = input.onState;
    this.#offline = !navigator.onLine;
    window.addEventListener("offline", this.#wentOffline);
    window.addEventListener("online", this.#cameOnline);
  }

  cancel(): void {
    if (this.#verifying) return;
    this.#cancelled = true;
    this.#abortActive();
    this.#wakeAll();
  }

  pauseResume(): boolean | undefined {
    if (this.#cancelled || this.#verifying || this.#offline) return undefined;
    this.#paused = !this.#paused;
    if (this.#paused) this.#abortActive();
    else this.#wakeAll();
    this.#emitProgress();
    return this.#paused;
  }

  async run(): Promise<UploadedRecord> {
    try {
      await this.#refreshParts();
      if (this.#publishedRecord) return this.#publishedRecord;
      while (this.#completed.size < this.#session.partCount) {
        await this.#waitUntilRunnable();
        if (this.#cancelled)
          throw new TransportError("cancelled", "Upload cancelled.");
        const pending = Array.from(
          { length: this.#session.partCount },
          (_, index) => index + 1,
        ).filter((partNumber) => !this.#completed.has(partNumber));
        await this.#ensureSigned(pending.slice(0, SIGN_BATCH_SIZE));
        const wave = pending.slice(0, UPLOAD_CONCURRENCY);
        const results = await Promise.allSettled(
          wave.map((partNumber) => this.#uploadPart(partNumber)),
        );
        const failure = results.find(
          (result): result is PromiseRejectedResult =>
            result.status === "rejected",
        );
        if (failure && !(failure.reason instanceof PauseInterruption)) {
          throw failure.reason;
        }
        if (this.#paused || this.#offline) await this.#refreshParts();
      }
      this.#verifying = true;
      this.#onState({
        name: "verifying",
        loaded: this.#file.size,
        total: this.#file.size,
      });
      return await this.#completeAndRecover();
    } catch (error) {
      if (this.#cancelled) {
        await fetch(`/api/uploads/direct/${this.#session.sessionId}`, {
          method: "DELETE",
          credentials: "same-origin",
          cache: "no-store",
        }).catch(() => undefined);
        throw new TransportError("cancelled", "Upload cancelled.");
      }
      throw error;
    } finally {
      window.removeEventListener("offline", this.#wentOffline);
      window.removeEventListener("online", this.#cameOnline);
      this.#abortActive();
    }
  }

  #wentOffline = () => {
    if (this.#verifying) return;
    this.#offline = true;
    this.#abortActive();
    this.#emitProgress();
  };

  #cameOnline = () => {
    this.#offline = false;
    this.#wakeAll();
    this.#emitProgress();
  };

  #abortActive(): void {
    for (const controller of this.#active.values()) controller.abort();
  }

  #wakeAll(): void {
    for (const wake of this.#waiters) wake();
  }

  #loadedBytes(): number {
    let loaded = 0;
    for (const partNumber of this.#completed) {
      loaded += this.#partBlob(partNumber).size;
    }
    for (const [partNumber, bytes] of this.#progress) {
      if (!this.#completed.has(partNumber)) loaded += bytes;
    }
    return Math.min(this.#file.size, loaded);
  }

  #emitProgress(): void {
    const state = this.#offline
      ? "offline"
      : this.#paused
        ? "paused"
        : "uploading";
    this.#onState({
      name: state,
      loaded: this.#loadedBytes(),
      total: this.#file.size,
    });
  }

  async #waitUntilRunnable(): Promise<void> {
    while ((this.#paused || this.#offline) && !this.#cancelled) {
      await new Promise<void>((resolve) => {
        const wake = () => {
          this.#waiters.delete(wake);
          resolve();
        };
        this.#waiters.add(wake);
        if ((!this.#paused && !this.#offline) || this.#cancelled) wake();
      });
      if (!this.#paused && !this.#offline) await this.#refreshParts();
    }
  }

  async #refreshParts(): Promise<void> {
    const status = await jsonRequest<StatusResponse>(
      `/api/uploads/direct/${this.#session.sessionId}`,
      { method: "GET" },
    );
    if (status.state === "published") {
      this.#publishedRecord = status.record;
      return;
    }
    if (
      status.state === "failed" ||
      status.state === "aborted" ||
      status.state === "aborting"
    ) {
      throw new TransportError(
        status.failureCode ?? status.state,
        "The direct upload is no longer available.",
      );
    }
    this.#progress.clear();
    if (!("uploadedParts" in status)) return;
    for (const partNumber of status.uploadedParts) {
      this.#completed.add(partNumber);
      this.#progress.delete(partNumber);
    }
    this.#emitProgress();
  }

  async #ensureSigned(partNumbers: number[]): Promise<void> {
    const missing = partNumbers.filter(
      (partNumber) => !this.#signed.has(partNumber),
    );
    if (missing.length === 0) return;
    const response = await jsonRequest<{
      parts: Array<{ partNumber: number; url: string }>;
    }>(`/api/uploads/direct/${this.#session.sessionId}/parts`, {
      method: "POST",
      body: JSON.stringify({ partNumbers: missing }),
    });
    for (const part of response.parts)
      this.#signed.set(part.partNumber, part.url);
  }

  #partBlob(partNumber: number): Blob {
    const start = (partNumber - 1) * this.#session.partSize;
    return this.#file.slice(
      start,
      Math.min(this.#file.size, start + this.#session.partSize),
    );
  }

  async #uploadPart(partNumber: number): Promise<void> {
    const body = this.#partBlob(partNumber);
    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
      await this.#waitUntilRunnable();
      if (this.#cancelled) throw new PauseInterruption();
      if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt]!);
      const controller = new AbortController();
      this.#active.set(partNumber, controller);
      try {
        await putPart({
          url: this.#signed.get(partNumber)!,
          body,
          signal: controller.signal,
          onProgress: (loaded) => {
            this.#progress.set(partNumber, loaded);
            this.#emitProgress();
          },
        });
        this.#completed.add(partNumber);
        this.#progress.delete(partNumber);
        this.#emitProgress();
        return;
      } catch (error) {
        if (error instanceof PauseInterruption) throw error;
        if (this.#paused || this.#offline || this.#cancelled)
          throw new PauseInterruption();
        const status =
          error instanceof TransportError ? error.status : undefined;
        if (status === 403) {
          this.#signed.delete(partNumber);
          await this.#ensureSigned([partNumber]);
        } else if (
          error instanceof TransportError &&
          error.code !== "network" &&
          (status === undefined ||
            (status < 500 && status !== 408 && status !== 429))
        ) {
          throw error;
        }
        if (attempt === RETRY_DELAYS_MS.length - 1) throw error;
      } finally {
        this.#active.delete(partNumber);
      }
    }
  }

  async #completeAndRecover(): Promise<UploadedRecord> {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      try {
        const result = await jsonRequest<
          | { state: "verifying" }
          | { state: "published"; record: UploadedRecord }
        >(`/api/uploads/direct/${this.#session.sessionId}/complete`, {
          method: "POST",
        });
        if (result.state === "published") return result.record;
      } catch (error) {
        const retryable =
          error instanceof TransportError &&
          (error.code === "network" ||
            error.status === 408 ||
            error.status === 409 ||
            error.status === 429 ||
            (error.status !== undefined && error.status >= 500));
        if (!retryable) {
          throw error;
        }
      }
      await sleep(2_000);
      const status = await jsonRequest<StatusResponse>(
        `/api/uploads/direct/${this.#session.sessionId}`,
        { method: "GET" },
      ).catch(() => null);
      if (status?.state === "published") return status.record;
      if (status?.state === "failed" || status?.state === "aborted") {
        throw new TransportError(
          status.failureCode ?? status.state,
          "Server verification did not accept the upload.",
        );
      }
    }
    throw new TransportError(
      "verification_timeout",
      "Verification is taking longer than expected. The server can still finish safely.",
    );
  }
}

export function startDirectUpload(input: DirectTransferInput): DirectTransfer {
  let scheduler: MultipartScheduler | undefined;
  const completion = (async () => {
    input.onState({ name: "preparing" });
    const prepared = await hashFile(input.file, input.signal);
    const init = await jsonRequest<InitResponse>("/api/uploads/direct", {
      method: "POST",
      signal: input.signal,
      body: JSON.stringify({
        originalName: input.file.name || "upload",
        byteSize: input.file.size,
        sha256: prepared.sha256,
        prefix: base64Url(prepared.prefix),
        ...(input.slug ? { slug: input.slug } : {}),
        ...(input.mediaDomain ? { mediaDomain: input.mediaDomain } : {}),
      }),
    });
    scheduler = new MultipartScheduler({
      file: input.file,
      session: init,
      onState: input.onState,
    });
    if (input.signal.aborted) scheduler.cancel();
    else
      input.signal.addEventListener("abort", () => scheduler?.cancel(), {
        once: true,
      });
    return scheduler.run();
  })();
  return {
    completion,
    cancel: () => scheduler?.cancel(),
    pauseResume: () => scheduler?.pauseResume(),
  };
}
