import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createWriteStream } from "node:fs";
import { chmod, lstat, mkdir, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { S3_UPLOAD_TIMEOUT_MS } from "./constants";
import { S3ProtocolError } from "./errors";

const TEMP_DIRECTORY = "/tmp/seedyn-s3";
const TEMP_FILE = /^[0-9a-f-]{36}\.s3upload$/u;
const TEMP_FILE_MAX_AGE_MS = 10 * 60 * 1_000;
const TEMP_SWEEP_INTERVAL_MS = 5 * 60 * 1_000;
const MAX_CONCURRENT_SPOOLS = 4;
let activeSpools = 0;
let lastTempSweepAt = 0;
let tempSweep: Promise<void> | undefined;

export type VerifiedS3Payload = Readonly<{
  byteSize: number;
  path: string;
  sha256Hex: string;
  dispose(): Promise<void>;
}>;

async function removeFile(path: string | undefined): Promise<void> {
  if (!path) return;
  try {
    await unlink(path);
  } catch (error) {
    if (
      typeof error !== "object" ||
      error === null ||
      Reflect.get(error, "code") !== "ENOENT"
    ) {
      throw error;
    }
  }
}

async function sweepStaleTemporaryFiles(): Promise<void> {
  const cutoff = Date.now() - TEMP_FILE_MAX_AGE_MS;
  const entries = await readdir(TEMP_DIRECTORY, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !TEMP_FILE.test(entry.name)) continue;
    const path = join(TEMP_DIRECTORY, entry.name);
    const status = await lstat(path);
    if (
      status.isFile() &&
      !status.isSymbolicLink() &&
      status.mtimeMs <= cutoff
    ) {
      await removeFile(path);
    }
  }
  lastTempSweepAt = Date.now();
}

async function reapStaleTemporaryFiles(): Promise<void> {
  if (Date.now() - lastTempSweepAt < TEMP_SWEEP_INTERVAL_MS) return;
  tempSweep ??= sweepStaleTemporaryFiles().finally(() => {
    tempSweep = undefined;
  });
  await tempSweep;
}

function acquireSpoolSlot(): () => void {
  if (activeSpools >= MAX_CONCURRENT_SPOOLS) {
    throw new S3ProtocolError(
      "SlowDown",
      "Too many object uploads are in progress. Try again shortly.",
    );
  }
  activeSpools += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeSpools = Math.max(0, activeSpools - 1);
  };
}

async function prepareDirectory(): Promise<void> {
  await mkdir(TEMP_DIRECTORY, { recursive: true, mode: 0o700 });
  const status = await lstat(TEMP_DIRECTORY);
  if (!status.isDirectory() || status.isSymbolicLink()) {
    throw new S3ProtocolError(
      "ServiceUnavailable",
      "The upload workspace is unavailable.",
    );
  }
  await chmod(TEMP_DIRECTORY, 0o700);
  await reapStaleTemporaryFiles();
}

function digestMatches(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  const matches = timingSafeEqual(actualBytes, expectedBytes);
  actualBytes.fill(0);
  expectedBytes.fill(0);
  return matches;
}

export async function spoolAndVerifyPayload(input: {
  contentLength: number;
  expectedSha256: string;
  maximumBytes: number;
  request: Request;
  timeoutMs?: number;
}): Promise<VerifiedS3Payload> {
  if (
    !Number.isSafeInteger(input.maximumBytes) ||
    input.maximumBytes < 0 ||
    input.contentLength > input.maximumBytes
  ) {
    throw new S3ProtocolError(
      "EntityTooLarge",
      "The proposed upload exceeds the permitted size.",
    );
  }
  const releaseSlot = acquireSpoolSlot();
  let path: string | undefined;
  try {
    await prepareDirectory();
    path = join(TEMP_DIRECTORY, `${randomUUID()}.s3upload`);
  } catch (error) {
    releaseSlot();
    throw error;
  }
  const sha256 = createHash("sha256");
  let byteSize = 0;
  const inspector = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      byteSize += chunk.byteLength;
      if (byteSize > input.maximumBytes || byteSize > input.contentLength) {
        callback(
          new S3ProtocolError(
            "EntityTooLarge",
            "The request body exceeds the declared or permitted size.",
          ),
        );
        return;
      }
      sha256.update(chunk);
      callback(null, chunk);
    },
  });
  const writer = createWriteStream(path, { flags: "wx", mode: 0o600 });
  const timeoutSignal = AbortSignal.timeout(
    input.timeoutMs ?? S3_UPLOAD_TIMEOUT_MS,
  );
  const signal = AbortSignal.any([input.request.signal, timeoutSignal]);
  const source = input.request.body
    ? Readable.fromWeb(input.request.body)
    : Readable.from([]);

  try {
    await pipeline(source, inspector, writer, { signal });
    if (byteSize !== input.contentLength) {
      throw new S3ProtocolError(
        "IncompleteBody",
        "The request body length does not match Content-Length.",
      );
    }
    const sha256Hex = sha256.digest("hex");
    if (!digestMatches(sha256Hex, input.expectedSha256)) {
      throw new S3ProtocolError(
        "BadDigest",
        "The request body does not match x-amz-content-sha256.",
      );
    }
    let disposed = false;
    return {
      byteSize,
      path,
      sha256Hex,
      dispose: async () => {
        if (disposed) return;
        disposed = true;
        try {
          await removeFile(path);
        } finally {
          releaseSlot();
        }
      },
    };
  } catch (error) {
    source.destroy();
    inspector.destroy();
    writer.destroy();
    await removeFile(path).catch(() => undefined);
    releaseSlot();
    if (error instanceof S3ProtocolError) throw error;
    if (input.request.signal.aborted) {
      throw new S3ProtocolError(
        "RequestTimeout",
        "The request was aborted before the upload completed.",
        { cause: error },
      );
    }
    if (timeoutSignal.aborted) {
      throw new S3ProtocolError(
        "RequestTimeout",
        "The upload did not complete before the timeout.",
        { cause: error },
      );
    }
    throw new S3ProtocolError(
      "InvalidRequest",
      "The request body could not be read.",
      { cause: error },
    );
  }
}
