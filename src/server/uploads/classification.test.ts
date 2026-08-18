import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";

import {
  assertForcedUploadKind,
  classifyUpload,
  validateGifVariant,
} from "./classification";
import { UPLOAD_LIMITS, type ParsedUploadFile } from "./multipart";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

async function fixture(
  bytes: Uint8Array,
  name = "untrusted.bin",
): Promise<ParsedUploadFile> {
  const directory = await mkdtemp(join(tmpdir(), "seedyn-classification-"));
  directories.push(directory);
  const path = join(directory, "fixture");
  await writeFile(path, bytes, { mode: 0o600 });
  return {
    fieldName: "file",
    originalName: name,
    claimedContentType: "application/octet-stream",
    path,
    byteSize: bytes.byteLength,
    sha256Hex: createHash("sha256").update(bytes).digest("hex"),
    sniffPrefix: bytes.subarray(0, 8192),
    fields: {},
    dispose: async () => undefined,
  };
}

describe("byte-derived upload classification", () => {
  it("classifies strict UTF-8 text independently of the claimed filename", async () => {
    const file = await fixture(
      new TextEncoder().encode("hello, seedyn\n"),
      "fake.png",
    );
    await expect(classifyUpload(file)).resolves.toMatchObject({
      kind: "TEXT",
      extension: "txt",
      disposition: "INLINE",
    });
  });

  it("keeps HTML and SVG-like text attachment-only", async () => {
    const html = await fixture(
      new TextEncoder().encode("<!doctype html><h1>x</h1>"),
    );
    await expect(classifyUpload(html)).resolves.toMatchObject({
      kind: "FILE",
      extension: "html",
      disposition: "ATTACHMENT",
    });
  });

  it("keeps invalid UTF-8 and control-bearing bytes generic", async () => {
    const file = await fixture(new Uint8Array([0x61, 0, 0xff, 0x62]));
    await expect(classifyUpload(file)).resolves.toMatchObject({
      kind: "FILE",
      extension: "bin",
      disposition: "ATTACHMENT",
    });
  });

  it("rejects forced legacy kind mismatches", () => {
    expect(() => assertForcedUploadKind({ kind: "FILE" }, "image")).toThrow(
      "The uploaded bytes do not match the required media type.",
    );
    expect(() => assertForcedUploadKind({ kind: "TEXT" }, "file")).toThrow(
      "The uploaded bytes do not match the required media type.",
    );
    expect(() =>
      assertForcedUploadKind({ kind: "IMAGE" }, "image"),
    ).not.toThrow();
  });

  it("validates a real GIF by magic and sharp metadata", async () => {
    const bytes = Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
      "base64",
    );
    const file = await fixture(bytes, "anything.dat");
    await expect(validateGifVariant(file)).resolves.toMatchObject({
      kind: "IMAGE",
      extension: "gif",
      width: 1,
      height: 1,
    });
  });

  it("rejects a client GIF claim without GIF87a/GIF89a bytes", async () => {
    const file = await fixture(
      new TextEncoder().encode("not a gif"),
      "fake.gif",
    );
    await expect(validateGifVariant(file)).rejects.toMatchObject({
      code: "unsupported_media",
    });
  });

  it("rejects GIF dimensions beyond the untrusted-output policy", async () => {
    const bytes = await sharp({
      create: {
        width: 1921,
        height: 1,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .gif()
      .toBuffer();
    const file = await fixture(bytes, "wide.gif");
    await expect(validateGifVariant(file)).rejects.toMatchObject({
      code: "unsupported_media",
    });
  });

  it("keeps PDF bytes attachment-only regardless of a text claim", async () => {
    const file = await fixture(
      new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n"),
      "notes.txt",
    );
    await expect(classifyUpload(file)).resolves.toMatchObject({
      kind: "FILE",
      extension: "pdf",
      contentType: "application/octet-stream",
      disposition: "ATTACHMENT",
    });
  });

  it("rejects an oversized image signature before opening it with sharp", async () => {
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAADElEQVR42mNk+M/wHwAF/gL+4/SjWQAAAABJRU5ErkJggg==",
      "base64",
    );
    const file = await fixture(bytes, "large.png");

    await expect(
      classifyUpload({
        ...file,
        path: "/path-that-must-not-be-opened.png",
        byteSize: UPLOAD_LIMITS.imageOrText + 1,
      }),
    ).rejects.toMatchObject({ code: "payload_too_large" });
  });
});
