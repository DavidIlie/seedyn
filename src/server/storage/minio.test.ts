import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("~/env", () => ({
  env: {
    MINIO_URL: "127.0.0.1",
    MINIO_PORT: 9000,
    MINIO_SECURE: false,
    MINIO_KEY_ID: "test-key",
    MINIO_PASSWORD: "test-password",
    MINIO_BUCKET: "seedyn-test",
    NODE_ENV: "test",
  },
}));

import {
  MAX_CONCURRENT_MINIO_UPLOADS,
  MinioObjectStore,
  UploadConcurrencyLimiter,
} from "./minio";

const temporaryDirectories: string[] = [];

async function temporaryFile(contents: Uint8Array): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "seedyn-minio-test-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "upload.bin");
  await writeFile(path, contents);
  return path;
}

function putInput(filePath: string, byteSize: number) {
  return {
    key: "users/user_abc/uploads/123e4567-e89b-42d3-a456-426614174000/original.bin",
    filePath,
    byteSize,
    contentType: "application/octet-stream",
    metadata: {
      recordId: "123e4567-e89b-42d3-a456-426614174000",
      kind: "original" as const,
      sha256: "ab".repeat(32),
    },
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("MinIO object uploads", () => {
  it("uploads a zero-byte object without creating a file stream", async () => {
    const filePath = await temporaryFile(new Uint8Array());
    const putObject = vi
      .fn<(...args: unknown[]) => Promise<object>>()
      .mockResolvedValue({});
    const store = new MinioObjectStore({ putObject } as never);

    await store.put(putInput(filePath, 0));

    expect(putObject).toHaveBeenCalledOnce();
    const body: unknown = putObject.mock.calls[0]![2];
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it("unconditionally destroys a file stream after the client settles", async () => {
    const filePath = await temporaryFile(new Uint8Array([1, 2, 3]));
    let stream: Readable | undefined;
    let closed: Promise<void> | undefined;
    const putObject = vi
      .fn<(...args: unknown[]) => Promise<object>>()
      .mockImplementation((...args: unknown[]) => {
        stream = args[2] as Readable;
        closed = new Promise((resolve) => stream!.once("close", resolve));
        return Promise.resolve({});
      });
    const store = new MinioObjectStore({ putObject } as never);

    await store.put(putInput(filePath, 3));
    await closed;

    expect(stream?.destroyed).toBe(true);
  });

  it("caps process-local upload work and releases queued callers in order", async () => {
    const limiter = new UploadConcurrencyLimiter(MAX_CONCURRENT_MINIO_UPLOADS);
    let active = 0;
    let peak = 0;
    let started = 0;
    const startOrder: number[] = [];
    const releases: Array<() => void> = [];

    const tasks = Array.from(
      { length: MAX_CONCURRENT_MINIO_UPLOADS + 2 },
      (_, index) =>
        limiter.run(undefined, async () => {
          active += 1;
          started += 1;
          startOrder.push(index);
          peak = Math.max(peak, active);
          await new Promise<void>((resolve) => releases.push(resolve));
          active -= 1;
          return index;
        }),
    );

    await vi.waitFor(() => {
      expect(releases).toHaveLength(MAX_CONCURRENT_MINIO_UPLOADS);
    });
    expect(peak).toBe(MAX_CONCURRENT_MINIO_UPLOADS);

    for (const release of releases.splice(0)) release();
    await vi.waitFor(() => {
      expect(started).toBe(tasks.length);
      expect(releases).toHaveLength(2);
    });
    for (const release of releases.splice(0)) release();

    await expect(Promise.all(tasks)).resolves.toEqual(
      Array.from({ length: tasks.length }, (_, index) => index),
    );
    expect(peak).toBe(MAX_CONCURRENT_MINIO_UPLOADS);
    expect(startOrder).toEqual(
      Array.from({ length: tasks.length }, (_, index) => index),
    );
  });

  it("removes an aborted upload from the concurrency queue", async () => {
    const limiter = new UploadConcurrencyLimiter(1);
    let releaseFirst: (() => void) | undefined;
    const first = limiter.run(
      undefined,
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        }),
    );
    await vi.waitFor(() => expect(releaseFirst).toBeTypeOf("function"));

    const controller = new AbortController();
    const queued = limiter.run(controller.signal, async () => "unexpected");
    controller.abort(new Error("cancelled"));
    await expect(queued).rejects.toThrow("cancelled");

    releaseFirst!();
    await first;
    await expect(limiter.run(undefined, async () => "next")).resolves.toBe(
      "next",
    );
  });
});
