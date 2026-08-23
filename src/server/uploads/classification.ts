import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";

import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

import { parseMarkdownDocument } from "~/components/text/document-format";

import { DomainError } from "./errors";
import { UPLOAD_LIMITS, type ParsedUploadFile } from "./multipart";

export type UploadKindValue = "IMAGE" | "VIDEO" | "TEXT" | "FILE";
export type DispositionValue = "INLINE" | "ATTACHMENT";
export type ForcedUploadKind = "auto" | "image" | "file" | "text";

export type ClassifiedUpload = {
  kind: UploadKindValue;
  textLanguage: string | null;
  extension: string;
  contentType: string;
  disposition: DispositionValue;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  frameCount: number | null;
};

/**
 * `true` demands a rendered page and fails loudly when the bytes are not an
 * HTML document. `"auto"` asks for one only when the file really is HTML and
 * never throws — it is what the browser sends, so someone who saves a page and
 * uploads it gets a page without ticking anything, while a PNG dropped through
 * the same code path is classified as a PNG.
 */
export type HtmlRenderingRequest = boolean | "auto";

export type ClassificationOptions = {
  forcedKind?: ForcedUploadKind;
  textLanguage?: string;
  renderHtml?: HtmlRenderingRequest;
};

const TEXT_LANGUAGES = {
  bash: "sh",
  c: "c",
  cpp: "cpp",
  csharp: "cs",
  css: "css",
  document: "md",
  go: "go",
  html: "html",
  javascript: "js",
  java: "java",
  json: "json",
  kotlin: "kt",
  markdown: "md",
  php: "php",
  plaintext: "txt",
  python: "py",
  ruby: "rb",
  rust: "rs",
  sql: "sql",
  swift: "swift",
  toml: "toml",
  tsx: "tsx",
  typescript: "ts",
  xml: "xml",
  yaml: "yaml",
} as const;

const TEXT_LANGUAGE_ALIASES = new Map<string, keyof typeof TEXT_LANGUAGES>([
  ["bash", "bash"],
  ["sh", "bash"],
  ["shell", "bash"],
  ["c", "c"],
  ["cc", "cpp"],
  ["cpp", "cpp"],
  ["cxx", "cpp"],
  ["cs", "csharp"],
  ["csharp", "csharp"],
  ["css", "css"],
  ["document", "document"],
  ["go", "go"],
  ["html", "html"],
  ["js", "javascript"],
  ["javascript", "javascript"],
  ["java", "java"],
  ["json", "json"],
  ["kt", "kotlin"],
  ["kotlin", "kotlin"],
  ["md", "markdown"],
  ["markdown", "markdown"],
  ["php", "php"],
  ["plain", "plaintext"],
  ["plaintext", "plaintext"],
  ["text", "plaintext"],
  ["txt", "plaintext"],
  ["py", "python"],
  ["python", "python"],
  ["rb", "ruby"],
  ["ruby", "ruby"],
  ["rs", "rust"],
  ["rust", "rust"],
  ["sql", "sql"],
  ["swift", "swift"],
  ["toml", "toml"],
  ["tsx", "tsx"],
  ["ts", "typescript"],
  ["typescript", "typescript"],
  ["xml", "xml"],
  ["yaml", "yaml"],
  ["yml", "yaml"],
]);

function textMetadata(
  originalName: string,
  requestedLanguage: string | undefined,
): { extension: string; textLanguage: string } {
  const requested = requestedLanguage?.trim().toLowerCase();
  if (requestedLanguage !== undefined && !requested) {
    throw new DomainError("invalid_input", {
      message: "The text language is invalid.",
    });
  }
  const filenameExtension = originalName
    .toLowerCase()
    .match(/\.([a-z0-9]{1,10})$/)?.[1];
  const candidate = requested ?? filenameExtension ?? "plaintext";
  const language = TEXT_LANGUAGE_ALIASES.get(candidate);
  if (!language) {
    if (requested) {
      throw new DomainError("invalid_input", {
        message: "The text language is not supported.",
      });
    }
    return { extension: "txt", textLanguage: "plaintext" };
  }
  return { extension: TEXT_LANGUAGES[language], textLanguage: language };
}

async function textClassification(
  file: ParsedUploadFile,
  requestedLanguage: string | undefined,
): Promise<ClassifiedUpload> {
  const metadata = textMetadata(
    file.originalName || file.fields.filename || "upload",
    requestedLanguage,
  );
  if (metadata.textLanguage === "document") {
    try {
      parseMarkdownDocument(await readFile(file.path, "utf8"));
    } catch (error) {
      throw new DomainError("invalid_input", {
        message: "The rich-text document is malformed or unsupported.",
        cause: error,
      });
    }
  }
  return {
    kind: "TEXT",
    ...metadata,
    contentType: "text/plain; charset=utf-8",
    disposition: "INLINE",
    width: null,
    height: null,
    durationMs: null,
    frameCount: null,
  };
}

const SAFE_IMAGES = new Map<string, { extension: string; contentType: string }>(
  [
    ["jpg", { extension: "jpg", contentType: "image/jpeg" }],
    ["png", { extension: "png", contentType: "image/png" }],
    ["webp", { extension: "webp", contentType: "image/webp" }],
    ["avif", { extension: "avif", contentType: "image/avif" }],
    ["gif", { extension: "gif", contentType: "image/gif" }],
  ],
);

const SAFE_VIDEOS = new Map<string, { extension: string; contentType: string }>(
  [
    ["mp4", { extension: "mp4", contentType: "video/mp4" }],
    ["webm", { extension: "webm", contentType: "video/webm" }],
    ["mov", { extension: "mov", contentType: "video/quicktime" }],
  ],
);

function looksLikeGif(prefix: Uint8Array): boolean {
  if (prefix.byteLength < 6) return false;
  const magic = Buffer.from(prefix.subarray(0, 6)).toString("ascii");
  return magic === "GIF87a" || magic === "GIF89a";
}

function unsafeTextFormat(prefix: Uint8Array): { extension: string } | null {
  const value = new TextDecoder("utf-8", { fatal: false })
    .decode(prefix)
    .replace(/^\uFEFF/, "")
    .trimStart()
    .toLowerCase();
  if (
    value.startsWith("<!doctype html") ||
    value.startsWith("<html") ||
    value.startsWith("<script")
  ) {
    return { extension: "html" };
  }
  if (value.startsWith("<svg")) return { extension: "svg" };
  if (value.startsWith("<?xml") || /^<[a-z_][\w:.-]*(?:\s|>)/.test(value)) {
    return { extension: "xml" };
  }
  if (value.startsWith("#!")) return { extension: "txt" };
  if (
    /^(?:import\s|export\s|(?:const|let|var)\s+[a-z_$]|(?:async\s+)?function\s+[a-z_$])/i.test(
      value,
    )
  ) {
    return { extension: "js" };
  }
  return null;
}

function hasHtmlFilename(value: string): boolean {
  return /\.(?:html?|xhtml)$/iu.test(value.trim());
}

function looksLikeHtml(prefix: Uint8Array): boolean {
  const value = new TextDecoder("utf-8", { fatal: false })
    .decode(prefix)
    .replace(/^\uFEFF/u, "")
    .trimStart();
  return /^(?:(?:<!--[\s\S]*?-->\s*)*)(?:<!doctype\s+html\b|<html\b|<head\b|<body\b|<title\b|<style\b|<script\b)/iu.test(
    value,
  );
}

function htmlClassification(): ClassifiedUpload {
  return {
    kind: "FILE",
    textLanguage: null,
    extension: "html",
    contentType: "text/html; charset=utf-8",
    disposition: "INLINE",
    width: null,
    height: null,
    durationMs: null,
    frameCount: null,
  };
}

/**
 * The same document as a download rather than a page.
 *
 * `createUpload` degrades to this when an installation has no media origin
 * isolated from the application, which is the only condition under which an
 * automatic render is unsafe.
 */
export function htmlAttachmentClassification(): ClassifiedUpload {
  return {
    kind: "FILE",
    textLanguage: null,
    extension: "html",
    contentType: "application/octet-stream",
    disposition: "ATTACHMENT",
    width: null,
    height: null,
    durationMs: null,
    frameCount: null,
  };
}

export function isRenderedHtmlClassification(value: {
  contentType: string;
  disposition: string;
  extension: string;
}): boolean {
  return (
    value.disposition === "INLINE" &&
    value.extension === "html" &&
    value.contentType.toLowerCase().startsWith("text/html;")
  );
}

async function isStrictPlainText(path: string): Promise<boolean> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    for await (const chunk of createReadStream(path)) {
      const decoded = decoder.decode(chunk as Buffer, { stream: true });
      for (const character of decoded) {
        const code = character.codePointAt(0)!;
        if (code === 0) return false;
        if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
          return false;
        }
        if (code >= 0x7f && code <= 0x9f) return false;
      }
    }
    decoder.decode();
    return true;
  } catch {
    return false;
  }
}

async function rasterMetadata(path: string): Promise<{
  width: number;
  height: number;
  durationMs: number | null;
  frameCount: number;
}> {
  try {
    const metadata = await sharp(path, {
      animated: true,
      limitInputPixels: 100_000_000,
    }).metadata();
    if (!metadata.width || !metadata.height)
      throw new Error("Missing raster dimensions");
    const frameCount = metadata.pages ?? 1;
    const height = metadata.pageHeight ?? metadata.height;
    const durationMs = metadata.delay?.length
      ? metadata.delay.reduce((total, delay) => total + delay, 0)
      : null;
    return { width: metadata.width, height, durationMs, frameCount };
  } catch (error) {
    throw new DomainError("unsupported_media", {
      message: "The image is malformed or exceeds safe metadata limits.",
      cause: error,
    });
  }
}

export async function classifyUpload(
  file: ParsedUploadFile,
  options?: ClassificationOptions,
): Promise<ClassifiedUpload> {
  // Only an explicit `renderHtml=true` may fail the upload. `"auto"` always
  // falls through to whatever the bytes actually are.
  const demandsHtml = options?.renderHtml === true;

  if (file.byteSize === 0) {
    if (demandsHtml) {
      throw new DomainError("invalid_input", {
        message: "Only a non-empty UTF-8 HTML document can be rendered.",
      });
    }
    if (options?.forcedKind === "text") {
      return textClassification(file, options.textLanguage);
    }
    return {
      kind: "FILE",
      textLanguage: null,
      extension: "bin",
      contentType: "application/octet-stream",
      disposition: "ATTACHMENT",
      width: null,
      height: null,
      durationMs: null,
      frameCount: null,
    };
  }
  let detected: Awaited<ReturnType<typeof fileTypeFromBuffer>>;
  try {
    detected = await fileTypeFromBuffer(file.sniffPrefix);
  } catch {
    detected = undefined;
  }

  if (detected) {
    if (demandsHtml) {
      throw new DomainError("invalid_input", {
        message: "Only a UTF-8 HTML document can be rendered as a page.",
      });
    }
    const image = SAFE_IMAGES.get(detected.ext);
    if (image) {
      // The byte signature is enough to apply the image ceiling before sharp
      // scans dimensions and an animated frame table.
      if (file.byteSize > UPLOAD_LIMITS.imageOrText) {
        throw new DomainError("payload_too_large", {
          message: `The upload exceeds the ${UPLOAD_LIMITS.imageOrText / (1024 * 1024)} MiB limit for this media type.`,
        });
      }
      const metadata = await rasterMetadata(file.path);
      return {
        kind: "IMAGE",
        textLanguage: null,
        ...image,
        disposition: "INLINE",
        ...metadata,
      };
    }

    const video = SAFE_VIDEOS.get(detected.ext);
    if (video) {
      return {
        kind: "VIDEO",
        textLanguage: null,
        ...video,
        disposition: "INLINE",
        width: null,
        height: null,
        durationMs: null,
        frameCount: null,
      };
    }

    // PDF, archives, executables, unsupported media, and every other known
    // binary format remain downloadable but never render inline.
    return {
      kind: "FILE",
      textLanguage: null,
      extension: /^[a-z0-9]{1,10}$/.test(detected.ext) ? detected.ext : "bin",
      contentType: "application/octet-stream",
      disposition: "ATTACHMENT",
      width: null,
      height: null,
      durationMs: null,
      frameCount: null,
    };
  }

  if (await isStrictPlainText(file.path)) {
    const originalName = file.originalName || file.fields.filename || "upload";
    const isHtmlDocument =
      hasHtmlFilename(originalName) || looksLikeHtml(file.sniffPrefix);
    if (demandsHtml) {
      if (!isHtmlDocument) {
        throw new DomainError("invalid_input", {
          message: "Only a UTF-8 HTML document can be rendered as a page.",
        });
      }
      return htmlClassification();
    }
    // A saved web page is the common case for `"auto"`, so it renders unless
    // the caller pinned the upload to another kind.
    if (
      options?.renderHtml === "auto" &&
      isHtmlDocument &&
      (options.forcedKind ?? "auto") === "auto"
    ) {
      return htmlClassification();
    }
    const unsafe = hasHtmlFilename(originalName)
      ? { extension: "html" }
      : unsafeTextFormat(file.sniffPrefix);
    if (unsafe && options?.forcedKind !== "text") {
      return {
        kind: "FILE",
        textLanguage: null,
        extension: unsafe.extension,
        contentType: "application/octet-stream",
        disposition: "ATTACHMENT",
        width: null,
        height: null,
        durationMs: null,
        frameCount: null,
      };
    }
    return textClassification(file, options?.textLanguage);
  }

  if (demandsHtml) {
    throw new DomainError("invalid_input", {
      message: "Only a UTF-8 HTML document can be rendered as a page.",
    });
  }

  return {
    kind: "FILE",
    textLanguage: null,
    extension: "bin",
    contentType: "application/octet-stream",
    disposition: "ATTACHMENT",
    width: null,
    height: null,
    durationMs: null,
    frameCount: null,
  };
}

export function assertClassificationSize(
  file: Pick<ParsedUploadFile, "byteSize">,
  classification: Pick<ClassifiedUpload, "kind" | "contentType">,
): void {
  const maximum =
    classification.kind === "IMAGE" ||
    classification.kind === "TEXT" ||
    classification.contentType.toLowerCase().startsWith("text/html;")
      ? UPLOAD_LIMITS.imageOrText
      : UPLOAD_LIMITS.generic;
  if (file.byteSize > maximum) {
    throw new DomainError("payload_too_large", {
      message: `The upload exceeds the ${maximum / (1024 * 1024)} MiB limit for this media type.`,
    });
  }
}

export function assertForcedUploadKind(
  classification: Pick<ClassifiedUpload, "kind">,
  forcedKind: ForcedUploadKind,
): void {
  if (forcedKind === "auto") return;
  if (forcedKind === "image" && classification.kind !== "IMAGE") {
    throw new DomainError("unsupported_media");
  }
  if (forcedKind === "text" && classification.kind !== "TEXT") {
    throw new DomainError("unsupported_media");
  }
  if (forcedKind === "file" && classification.kind === "TEXT") {
    throw new DomainError("unsupported_media");
  }
}

export async function validateGifVariant(
  file: ParsedUploadFile,
): Promise<ClassifiedUpload> {
  if (file.byteSize > UPLOAD_LIMITS.gif) {
    throw new DomainError("payload_too_large", {
      message: "The GIF exceeds the 25 MiB variant limit.",
    });
  }
  if (!looksLikeGif(file.sniffPrefix))
    throw new DomainError("unsupported_media");
  const classification = await classifyUpload(file);
  if (classification.kind !== "IMAGE" || classification.extension !== "gif") {
    throw new DomainError("unsupported_media");
  }
  if (
    classification.width === null ||
    classification.height === null ||
    classification.width > 1920 ||
    classification.height > 1080 ||
    (classification.frameCount ?? 1) > 120 ||
    (classification.durationMs !== null && classification.durationMs > 60_000)
  ) {
    throw new DomainError("unsupported_media", {
      message:
        "The GIF exceeds the permitted dimensions, frame count, or duration.",
    });
  }
  return classification;
}

export function sanitizeOriginalName(value: string): string {
  const withoutControlCharacters = Array.from(value.normalize("NFC"))
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code > 0x1f && code !== 0x7f;
    })
    .join("");
  const normalized = withoutControlCharacters.replace(/[\\/]/g, "_").trim();
  const fallback = normalized || "upload";
  let output = "";
  for (const character of fallback) {
    if (Buffer.byteLength(output + character, "utf8") > 255) break;
    output += character;
  }
  return output || "upload";
}
