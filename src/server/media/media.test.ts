import { describe, expect, it } from "vitest";

import { contentDispositionHeader } from "./disposition";
import {
  buildPublicMediaHeaders,
  buildRangeNotSatisfiableHeaders,
  sha256Etag,
} from "./headers";
import { parseSingleByteRange } from "./range";

describe("single byte ranges", () => {
  it.each([
    ["bytes=0-0", { start: 0, end: 0, length: 1 }],
    ["bytes=5-", { start: 5, end: 9, length: 5 }],
    ["bytes=-3", { start: 7, end: 9, length: 3 }],
    ["bytes=0-999", { start: 0, end: 9, length: 10 }],
  ])("parses %s", (header, expected) => {
    expect(parseSingleByteRange(header, 10)).toEqual({
      kind: "valid",
      range: expected,
    });
  });

  it.each(["bytes=10-", "bytes=-0"])("rejects unsatisfiable %s", (header) =>
    expect(parseSingleByteRange(header, 10)).toEqual({ kind: "invalid" }),
  );

  it.each([
    "bytes=",
    "bytes=4-3",
    "bytes=0-1,3-4",
    "bytes=letters",
    "items=0-1",
  ])("ignores unsupported or malformed %s", (header) =>
    expect(parseSingleByteRange(header, 10)).toEqual({ kind: "none" }),
  );

  it("clamps a very large final position instead of rejecting it", () => {
    expect(
      parseSingleByteRange("bytes=2-999999999999999999999999", 10),
    ).toEqual({
      kind: "valid",
      range: { start: 2, end: 9, length: 8 },
    });
  });
});

describe("trusted public response headers", () => {
  it("sanitizes content disposition without reflecting CRLF or paths", () => {
    const value = contentDispositionHeader(
      "ATTACHMENT",
      '../bad"\r\nX-Evil: yes.txt',
    );
    expect(value).toMatch(/^attachment;/);
    expect(value).not.toContain("\r");
    expect(value).not.toContain("\n");
    expect(value).not.toContain("../");
  });

  it("builds immutable, cross-origin, nosniff headers from trusted metadata", () => {
    const sha = new Uint8Array(32).fill(0xab);
    const headers = buildPublicMediaHeaders({
      byteSize: 10,
      contentType: "image/png",
      disposition: "INLINE",
      originalName: "image.png",
      sha256: sha,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    expect(headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(headers.get("Cross-Origin-Resource-Policy")).toBe("cross-origin");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Cache-Control")).toContain("s-maxage=86400");
    expect(headers.get("ETag")).toBe(sha256Etag(sha));
    expect(headers.get("Content-Length")).toBe("10");
  });

  it("keeps partial responses out of shared immutable caches", () => {
    const headers = buildPublicMediaHeaders(
      {
        byteSize: 10,
        contentType: "video/mp4",
        disposition: "INLINE",
        originalName: "clip.mp4",
        sha256: new Uint8Array(32).fill(0xab),
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
      { start: 2, end: 5, length: 4 },
    );

    expect(headers.get("Cache-Control")).toBe(
      "private, max-age=3600, no-transform",
    );
    expect(headers.get("Vary")).toBe("Range");
    expect(headers.get("Content-Range")).toBe("bytes 2-5/10");
    expect(headers.get("Content-Length")).toBe("4");
  });

  it("returns an exact unsatisfied range marker", () => {
    const headers = buildRangeNotSatisfiableHeaders(42);
    expect(headers.get("Content-Range")).toBe("bytes */42");
    expect(headers.get("Content-Security-Policy")).toBe(
      "sandbox; default-src 'none'",
    );
  });
});
