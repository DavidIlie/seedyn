import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { chmod, lstat, mkdir, readdir, unlink } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";

import Busboy from "busboy";

import { DomainError } from "./errors";

export const MEBIBYTE = 1024 * 1024;
export const UPLOAD_LIMITS = {
  generic: 64 * MEBIBYTE,
  imageOrText: 16 * MEBIBYTE,
  gif: 25 * MEBIBYTE,
  scalarFields: 6,
  scalarFieldBytes: 4 * 1024,
  sniffBytes: 8 * 1024,
} as const;

const TEMP_DIRECTORY = "/tmp/seedyn-uploads";
const TEMP_FILE = /^[0-9a-f-]{36}\.upload$/u;
const TEMP_FILE_MAX_AGE_MS = 10 * 60 * 1_000;
const TEMP_SWEEP_INTERVAL_MS = 5 * 60 * 1_000;
let lastTempSweepAt = 0;
let tempSweep: Promise<void> | undefined;

export type ParsedUploadFile = {
  readonly fieldName: string;
  readonly originalName: string;
  readonly claimedContentType: string;
  readonly path: string;
  readonly byteSize: number;
  readonly sha256Hex: string;
  readonly sniffPrefix: Uint8Array;
  readonly fields: Readonly<Record<string, string>>;
  dispose(): Promise<void>;
};

export type ParseMultipartOptions = {
  permittedFileFields: ReadonlySet<string>;
  permittedScalarFields?: ReadonlySet<string>;
  maxFileBytes: number;
  timeoutMs?: number;
};

async function removeTemporaryFile(path: string | undefined): Promise<void> {
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
      await removeTemporaryFile(path);
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

async function prepareTemporaryDirectory(): Promise<void> {
  await mkdir(TEMP_DIRECTORY, { recursive: true, mode: 0o700 });
  const status = await lstat(TEMP_DIRECTORY);
  if (!status.isDirectory() || status.isSymbolicLink()) {
    throw new DomainError("internal", {
      message: "The upload workspace is unavailable.",
    });
  }
  await chmod(TEMP_DIRECTORY, 0o700);
  await reapStaleTemporaryFiles();
}

function contentTypeHeader(request: Request): string {
  const value = request.headers.get("content-type");
  if (!value?.toLowerCase().startsWith("multipart/form-data")) {
    throw new DomainError("invalid_input", {
      message: "Content-Type must be multipart/form-data.",
    });
  }
  return value;
}

export async function parseMultipartUpload(
  request: Request,
  options: ParseMultipartOptions,
): Promise<ParsedUploadFile> {
  if (!request.body) throw new DomainError("missing_file");
  if (
    !Number.isSafeInteger(options.maxFileBytes) ||
    options.maxFileBytes < 1 ||
    options.maxFileBytes >= Number.MAX_SAFE_INTEGER
  ) {
    throw new TypeError("maxFileBytes must be a positive safe integer");
  }

  const contentType = contentTypeHeader(request);
  await prepareTemporaryDirectory();

  const fields: Record<string, string> = {};
  const allowedFields =
    options.permittedScalarFields ?? new Set(["kind", "filename"]);
  let scalarFieldCount = 0;
  let fileCount = 0;
  let tempPath: string | undefined;
  let fileResult: Omit<ParsedUploadFile, "fields" | "dispose"> | undefined;
  let filePipeline: Promise<void> | undefined;
  let limited = false;
  let settled = false;

  const source = Readable.fromWeb(request.body);
  let parser: ReturnType<typeof Busboy>;
  try {
    parser = Busboy({
      headers: { "content-type": contentType },
      defParamCharset: "utf8",
      limits: {
        // Busboy marks a file truncated when it reaches (not exceeds) its
        // configured limit. One sentinel byte keeps our public cap inclusive.
        fileSize: options.maxFileBytes + 1,
        files: 1,
        fields: UPLOAD_LIMITS.scalarFields,
        fieldSize: UPLOAD_LIMITS.scalarFieldBytes,
        parts: UPLOAD_LIMITS.scalarFields + 1,
        headerPairs: 100,
      },
    });
  } catch (error) {
    throw new DomainError("invalid_input", {
      message: "The multipart boundary is invalid.",
      cause: error,
    });
  }

  const parsed = new Promise<void>((resolve, reject) => {
    let timeout: NodeJS.Timeout | undefined;
    const abort = () => fail(new DomainError("request_aborted"));
    const removeGuards = () => {
      if (timeout) clearTimeout(timeout);
      request.signal.removeEventListener("abort", abort);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      removeGuards();
      const safe =
        error instanceof DomainError
          ? error
          : new DomainError("invalid_input", {
              message: "The multipart upload is malformed or truncated.",
              cause: error,
            });
      source.destroy(safe);
      parser.destroy(safe);
      reject(safe);
    };

    timeout = setTimeout(() => {
      fail(new DomainError("request_timeout"));
    }, options.timeoutMs ?? 110_000);
    timeout.unref();

    // Install error sinks before checking a pre-aborted signal because fail()
    // destroys both streams with the safe DomainError.
    parser.once("error", fail);
    source.once("error", fail);
    request.signal.addEventListener("abort", abort, { once: true });
    if (request.signal.aborted) {
      fail(new DomainError("request_aborted"));
      return;
    }

    const finish = async () => {
      if (settled) return;
      try {
        await filePipeline;
        if (limited) throw new DomainError("payload_too_large");
        if (fileCount === 0 || !fileResult)
          throw new DomainError("missing_file");
        settled = true;
        resolve();
      } catch (error) {
        fail(error);
      } finally {
        removeGuards();
      }
    };

    parser.on("file", (fieldName, file, info) => {
      fileCount += 1;
      if (fileCount !== 1 || !options.permittedFileFields.has(fieldName)) {
        file.resume();
        fail(
          new DomainError("invalid_input", {
            message: "The multipart request contains an unexpected file field.",
          }),
        );
        return;
      }

      tempPath = join(TEMP_DIRECTORY, `${randomUUID()}.upload`);
      const hash = createHash("sha256");
      const prefixParts: Buffer[] = [];
      let prefixBytes = 0;
      let byteSize = 0;

      const inspector = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          byteSize += chunk.byteLength;
          hash.update(chunk);
          if (prefixBytes < UPLOAD_LIMITS.sniffBytes) {
            const remaining = UPLOAD_LIMITS.sniffBytes - prefixBytes;
            const part = chunk.subarray(0, remaining);
            prefixParts.push(Buffer.from(part));
            prefixBytes += part.byteLength;
          }
          callback(null, chunk);
        },
      });

      file.once("limit", () => {
        limited = true;
        fail(new DomainError("payload_too_large"));
      });

      const writer = createWriteStream(tempPath, { flags: "wx", mode: 0o600 });
      filePipeline = pipeline(file, inspector, writer).then(() => {
        if (file.truncated || limited)
          throw new DomainError("payload_too_large");
        fileResult = {
          fieldName,
          originalName: info.filename,
          claimedContentType: info.mimeType,
          path: tempPath!,
          byteSize,
          sha256Hex: hash.digest("hex"),
          sniffPrefix: new Uint8Array(Buffer.concat(prefixParts)),
        };
        return undefined;
      });
      void filePipeline.catch(() => undefined);
    });

    parser.on("field", (fieldName, value, info) => {
      scalarFieldCount += 1;
      if (
        scalarFieldCount > UPLOAD_LIMITS.scalarFields ||
        !allowedFields.has(fieldName) ||
        info.nameTruncated ||
        info.valueTruncated ||
        Buffer.byteLength(value, "utf8") > UPLOAD_LIMITS.scalarFieldBytes
      ) {
        fail(
          new DomainError("invalid_input", {
            message: "The multipart request contains invalid form fields.",
          }),
        );
        return;
      }
      if (Object.hasOwn(fields, fieldName)) {
        fail(
          new DomainError("invalid_input", {
            message: "The multipart request contains a duplicate form field.",
          }),
        );
        return;
      }
      fields[fieldName] = value;
    });
    parser.once("filesLimit", () =>
      fail(
        new DomainError("invalid_input", {
          message: "Only one file may be uploaded at a time.",
        }),
      ),
    );
    parser.once("fieldsLimit", () =>
      fail(
        new DomainError("invalid_input", {
          message: "The multipart request contains too many form fields.",
        }),
      ),
    );
    parser.once("partsLimit", () =>
      fail(
        new DomainError("invalid_input", {
          message: "The multipart request contains too many parts.",
        }),
      ),
    );
    parser.once("close", () => void finish());
    source.pipe(parser);
  });

  try {
    await parsed;
  } catch (error) {
    await filePipeline?.catch(() => undefined);
    await removeTemporaryFile(tempPath).catch(() => undefined);
    throw error;
  }

  if (!fileResult) {
    await removeTemporaryFile(tempPath);
    throw new DomainError("missing_file");
  }

  let disposed = false;
  const result = fileResult;
  return {
    ...result,
    fields: Object.freeze({ ...fields }),
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      await removeTemporaryFile(result.path);
    },
  };
}
