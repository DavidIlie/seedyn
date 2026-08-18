import "server-only";

import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";

import { Client } from "minio";

import { env } from "~/env";

import {
  isManagedMetadata,
  normalizeStorageMetadata,
  storageMetadata,
  type ByteRange,
  type ManagedObjectSummary,
  type ObjectHead,
  type ObjectStore,
  type PutObjectInput,
} from "./object-store";
import { assertManagedListPrefix, isManagedObjectKey } from "./keys";

const MINIO_UPLOAD_PART_SIZE = 5 * 1024 * 1024;
const MAX_CONCURRENT_MINIO_UPLOADS = 4;

type MinioClient = Pick<
  Client,
  | "bucketExists"
  | "getObject"
  | "getPartialObject"
  | "listObjectsV2"
  | "putObject"
  | "removeObject"
  | "statObject"
>;

function uploadAbortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("Object upload aborted", {
        cause: signal.reason,
      });
}

class UploadConcurrencyLimiter {
  readonly #limit: number;
  #active = 0;
  readonly #waiters: Array<() => void> = [];

  constructor(limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new TypeError(
        "Upload concurrency limit must be a positive integer",
      );
    }
    this.#limit = limit;
  }

  async run<T>(signal: AbortSignal | undefined, task: () => Promise<T>) {
    await this.#acquire(signal);
    try {
      return await task();
    } finally {
      this.#release();
    }
  }

  async #acquire(signal: AbortSignal | undefined): Promise<void> {
    if (signal?.aborted) throw uploadAbortError(signal);
    if (this.#active < this.#limit) {
      this.#active += 1;
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const grant = () => {
        signal?.removeEventListener("abort", abort);
        this.#active += 1;
        resolve();
      };
      const abort = () => {
        const index = this.#waiters.indexOf(grant);
        if (index >= 0) this.#waiters.splice(index, 1);
        reject(uploadAbortError(signal!));
      };

      this.#waiters.push(grant);
      signal?.addEventListener("abort", abort, { once: true });
      // Cover an abort between the initial check and listener registration.
      if (signal?.aborted) abort();
    });
  }

  #release(): void {
    if (this.#active < 1) {
      throw new Error("Upload concurrency limiter released without a lease");
    }
    this.#active -= 1;
    this.#waiters.shift()?.();
  }
}

function isMissingObject(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = Reflect.get(error, "code");
  return code === "NoSuchKey" || code === "NotFound" || code === "NoSuchObject";
}

function createClient(): Client {
  return new Client({
    endPoint: env.MINIO_URL,
    port: env.MINIO_PORT,
    useSSL: env.MINIO_SECURE,
    accessKey: env.MINIO_KEY_ID,
    secretKey: env.MINIO_PASSWORD,
    // Minio buffers an entire object when it is no larger than partSize. The
    // minimum legal override keeps large uploads on its multipart stream path.
    partSize: MINIO_UPLOAD_PART_SIZE,
  });
}

const globalForMinio = globalThis as unknown as {
  seedynMinio?: Client;
  seedynMinioUploadLimiter?: UploadConcurrencyLimiter;
};
const client = globalForMinio.seedynMinio ?? createClient();
if (env.NODE_ENV !== "production") globalForMinio.seedynMinio = client;
const uploadConcurrencyLimiter =
  globalForMinio.seedynMinioUploadLimiter ??
  new UploadConcurrencyLimiter(MAX_CONCURRENT_MINIO_UPLOADS);
// Unlike the development-only client cache, the limiter must be global in every
// environment so separately loaded Next.js route chunks share one process cap.
globalForMinio.seedynMinioUploadLimiter = uploadConcurrencyLimiter;

class MinioObjectStore implements ObjectStore {
  constructor(
    private readonly minioClient: MinioClient = client,
    private readonly uploadLimiter = uploadConcurrencyLimiter,
  ) {}

  async put(input: PutObjectInput): Promise<void> {
    await this.uploadLimiter.run(input.signal, async () => {
      const metadata = {
        "Content-Type": input.contentType,
        ...storageMetadata(input.metadata),
      };

      // minio-js short-circuits a zero-sized upload without consuming a stream.
      // Avoid opening a descriptor that the client would never close.
      if (input.byteSize === 0) {
        if (input.signal?.aborted) throw uploadAbortError(input.signal);
        await this.minioClient.putObject(
          env.MINIO_BUCKET,
          input.key,
          Buffer.alloc(0),
          0,
          metadata,
        );
        return;
      }

      const stream = createReadStream(input.filePath);
      const abort = () => stream.destroy(new Error("Object upload aborted"));
      input.signal?.addEventListener("abort", abort, { once: true });
      if (input.signal?.aborted) abort();
      try {
        await this.minioClient.putObject(
          env.MINIO_BUCKET,
          input.key,
          stream,
          input.byteSize,
          metadata,
        );
      } finally {
        input.signal?.removeEventListener("abort", abort);
        if (!stream.destroyed) stream.destroy();
      }
    });
  }

  async head(key: string): Promise<ObjectHead | null> {
    try {
      const stat = await this.minioClient.statObject(env.MINIO_BUCKET, key);
      return {
        key,
        byteSize: stat.size,
        lastModified: stat.lastModified,
        metadata: normalizeStorageMetadata(stat.metaData),
      };
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
  }

  async stream(key: string, range?: ByteRange): Promise<Readable> {
    if (range) {
      return this.minioClient.getPartialObject(
        env.MINIO_BUCKET,
        key,
        range.start,
        range.length,
      );
    }
    return this.minioClient.getObject(env.MINIO_BUCKET, key);
  }

  async delete(key: string): Promise<"deleted" | "missing"> {
    const existing = await this.head(key);
    if (!existing) return "missing";
    await this.minioClient.removeObject(env.MINIO_BUCKET, key);
    return "deleted";
  }

  async *listForReconciliation(
    prefix: string,
  ): AsyncIterable<ManagedObjectSummary> {
    // Validate before the network call. The caller can never list the bucket root
    // or an attacker-selected namespace through this abstraction.
    assertManagedListPrefix(prefix);
    const listing = this.minioClient.listObjectsV2(
      env.MINIO_BUCKET,
      prefix,
      true,
    );
    for await (const item of listing) {
      if (!item.name) continue;
      if (!item.name.startsWith(prefix)) {
        throw new TypeError("Storage returned an object outside the prefix");
      }
      const head = await this.head(item.name);
      if (!head) continue;
      yield {
        key: item.name,
        byteSize: head.byteSize,
        lastModified: head.lastModified,
        metadata: head.metadata,
        managed:
          isManagedObjectKey(item.name) && isManagedMetadata(head.metadata),
      };
    }
  }
}

export const objectStore: ObjectStore = new MinioObjectStore();

export async function checkObjectStorageReadiness(): Promise<void> {
  if (!(await client.bucketExists(env.MINIO_BUCKET))) {
    throw new Error("Object storage bucket is unavailable");
  }
}

export {
  MAX_CONCURRENT_MINIO_UPLOADS,
  MINIO_UPLOAD_PART_SIZE,
  MinioObjectStore,
  UploadConcurrencyLimiter,
};
