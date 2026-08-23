import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { classifyUpload, type HtmlRenderingRequest } from "./classification";
import { DomainError } from "./errors";
import type { ParsedUploadFile } from "./multipart";

/**
 * The `renderHtml` matrix.
 *
 * `"auto"` is what every browser upload sends, so the promise that a saved page
 * renders — and that nothing else is ever refused because of it — is the one
 * behaviour worth pinning down below the Playwright suite.
 */

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQI12P4z9DwHxkzkC4AAEhPJ+GNvPjFAAAAAElFTkSuQmCC",
  "base64",
);

const HTML = Buffer.from(
  "<!doctype html>\n<html><head><title>Saved</title></head><body><p>Hi</p></body></html>\n",
  "utf8",
);

const directories: string[] = [];

after(async () => {
  await Promise.all(
    directories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function parsedFile(
  originalName: string,
  bytes: Buffer,
): Promise<ParsedUploadFile> {
  const directory = await mkdtemp(join(tmpdir(), "seedyn-classify-"));
  directories.push(directory);
  const path = join(directory, "upload.bin");
  await writeFile(path, bytes);
  return {
    fieldName: "file",
    originalName,
    claimedContentType: "application/octet-stream",
    path,
    byteSize: bytes.byteLength,
    sha256Hex: createHash("sha256").update(bytes).digest("hex"),
    sniffPrefix: new Uint8Array(bytes.subarray(0, 4096)),
    fields: {},
    dispose: () => Promise.resolve(),
  };
}

async function classify(
  originalName: string,
  bytes: Buffer,
  renderHtml: HtmlRenderingRequest,
) {
  return classifyUpload(await parsedFile(originalName, bytes), { renderHtml });
}

void describe("upload classification", () => {
  void it("renders a saved page automatically without an opt-in", async () => {
    const classification = await classify("saved-page.html", HTML, "auto");
    assert.equal(classification.contentType, "text/html; charset=utf-8");
    assert.equal(classification.disposition, "INLINE");
    assert.equal(classification.extension, "html");
  });

  void it("keeps HTML an attachment when nobody asked for a page", async () => {
    const classification = await classify("saved-page.html", HTML, false);
    assert.equal(classification.disposition, "ATTACHMENT");
    assert.equal(classification.contentType, "application/octet-stream");
  });

  void it("leaves every other automatic upload alone", async () => {
    const text = await classify("notes.txt", Buffer.from("plain\n"), "auto");
    assert.equal(text.kind, "TEXT");
    assert.equal(text.disposition, "INLINE");

    const image = await classify("shot.png", PNG, "auto");
    assert.equal(image.kind, "IMAGE");
    assert.equal(image.contentType, "image/png");
  });

  void it("never fails an automatic upload, including an empty file", async () => {
    const empty = await classify("empty.html", Buffer.alloc(0), "auto");
    assert.equal(empty.kind, "FILE");
    assert.equal(empty.disposition, "ATTACHMENT");
  });

  void it("still rejects an explicit render of bytes that are not HTML", async () => {
    await assert.rejects(
      () => classify("shot.png", PNG, true),
      (error: unknown) =>
        error instanceof DomainError && error.code === "invalid_input",
    );
  });
});
