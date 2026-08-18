import { Readable } from "node:stream";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { VERIFIED_MEDIA_REWRITE_HEADER } from "~/lib/origin";
import type * as RequestHelpers from "~/server/http/request";
import type * as PublicMedia from "~/server/media/public-media";
import type { PublicMediaRecord } from "~/server/media/public-media";

type FindPublicMedia = typeof PublicMedia.findPublicMedia;
type OpenPublicMedia = typeof PublicMedia.openPublicMedia;
type ValidatePublicMedia = typeof PublicMedia.validatePublicMedia;
type CheckPublicMediaRateLimit =
  typeof RequestHelpers.checkPublicMediaRateLimit;
type RequestSourceAddress = typeof RequestHelpers.requestSourceAddress;

const mocks = vi.hoisted(() => ({
  checkPublicMediaRateLimit: vi.fn<CheckPublicMediaRateLimit>(),
  findPublicMedia: vi.fn<FindPublicMedia>(),
  openPublicMedia: vi.fn<OpenPublicMedia>(),
  requestSourceAddress: vi.fn<RequestSourceAddress>(),
  validatePublicMedia: vi.fn<ValidatePublicMedia>(),
}));

vi.mock("~/server/http/request", () => ({
  checkPublicMediaRateLimit: mocks.checkPublicMediaRateLimit,
  isMediaHostRequest: (incoming: Request) =>
    incoming.headers.get("host") === "i.localhost:3000",
  requestSourceAddress: mocks.requestSourceAddress,
}));
vi.mock("~/server/media/public-media", () => ({
  findPublicMedia: mocks.findPublicMedia,
  openPublicMedia: mocks.openPublicMedia,
  validatePublicMedia: mocks.validatePublicMedia,
}));

import type { ByteRange } from "~/server/storage/object-store";

import { GET, HEAD } from "./route";

const asset = "AbCdEfGhIjKlMnOpQrStUv.png";
const bytes = Buffer.from("0123456789", "utf8");
const media = {
  id: "upload_1",
  publicSlug: "AbCdEfGhIjKlMnOpQrStUv",
  extension: "png",
  storageKey: "managed/key.png",
  storageKind: "original" as const,
  byteSize: bytes.byteLength,
  contentType: "image/png",
  disposition: "INLINE" as const,
  originalName: "image.png",
  sha256: new Uint8Array(32).fill(0xab),
  createdAt: new Date("2026-08-17T12:00:00Z"),
};

function request(headers: HeadersInit = {}): Request {
  return new Request(`http://i.localhost:3000/${asset}`, {
    headers: {
      host: "i.localhost:3000",
      ...Object.fromEntries(new Headers(headers)),
    },
  });
}

const context = { params: Promise.resolve({ asset }) };
const allowedRateLimit = {
  allowed: true as const,
  status: 200 as const,
  limit: 300,
  remaining: 299,
  resetAt: 2_000,
  retryAfterSeconds: 1,
  headers: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requestSourceAddress.mockReturnValue("127.0.0.1");
  mocks.checkPublicMediaRateLimit.mockResolvedValue(allowedRateLimit);
  mocks.findPublicMedia.mockResolvedValue(media);
  mocks.validatePublicMedia.mockResolvedValue(undefined);
  mocks.openPublicMedia.mockImplementation(
    async (_record: PublicMediaRecord, range?: ByteRange) => {
      const selected = range
        ? bytes.subarray(range.start, range.end + 1)
        : bytes;
      return Readable.from(selected);
    },
  );
});

describe("public media HTTP semantics", () => {
  it("fails closed for a hostile Host before database lookup", async () => {
    const response = await GET(request({ host: "attacker.test" }), context);
    expect(response.status).toBe(404);
    expect(mocks.findPublicMedia).not.toHaveBeenCalled();
    expect(mocks.openPublicMedia).not.toHaveBeenCalled();
  });

  it("accepts the Proxy-verified internal pass under Next's listen Host", async () => {
    const response = await GET(
      request({
        host: "localhost:3000",
        [VERIFIED_MEDIA_REWRITE_HEADER]: "1",
      }),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("0123456789");
  });

  it("rate-limits cache-bypassing ranges before database lookup", async () => {
    mocks.checkPublicMediaRateLimit.mockResolvedValue({
      ...allowedRateLimit,
      allowed: false,
      status: 429,
      reason: "rate_limited",
      remaining: 0,
      headers: { "Retry-After": "7" },
    });

    const response = await GET(request({ range: "bytes=0-0" }), context);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("7");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(mocks.checkPublicMediaRateLimit).toHaveBeenCalledWith({
      sourceAddress: "127.0.0.1",
      rangeRequested: true,
    });
    expect(mocks.findPublicMedia).not.toHaveBeenCalled();
  });

  it("answers matching conditional requests without opening storage", async () => {
    const etag = `"${"ab".repeat(32)}"`;
    const response = await GET(
      request({ "if-none-match": `W/${etag}` }),
      context,
    );
    expect(response.status).toBe(304);
    expect(response.headers.get("ETag")).toBe(etag);
    expect(response.headers.get("Content-Length")).toBeNull();
    expect(mocks.openPublicMedia).not.toHaveBeenCalled();
  });

  it("serves one satisfiable byte range with exact metadata", async () => {
    const response = await GET(request({ range: "bytes=2-5" }), context);
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 2-5/10");
    expect(response.headers.get("Content-Length")).toBe("4");
    expect(response.headers.get("Cache-Control")).toBe(
      "private, max-age=3600, no-transform",
    );
    expect(response.headers.get("Vary")).toContain("Range");
    await expect(response.text()).resolves.toBe("2345");
    expect(mocks.openPublicMedia).toHaveBeenCalledWith(media, {
      start: 2,
      end: 5,
      length: 4,
    });
  });

  it("ignores Range when If-Range does not match", async () => {
    const response = await GET(
      request({ range: "bytes=2-5", "if-range": '"different"' }),
      context,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Range")).toBeNull();
    expect(response.headers.get("Content-Length")).toBe("10");
    await expect(response.text()).resolves.toBe("0123456789");
  });

  it("returns 416 for an unsatisfiable GET range without opening storage", async () => {
    const response = await GET(request({ range: "bytes=20-" }), context);
    expect(response.status).toBe(416);
    expect(response.headers.get("Content-Range")).toBe("bytes */10");
    expect(response.headers.get("Content-Security-Policy")).toBe(
      "sandbox; default-src 'none'",
    );
    expect(mocks.openPublicMedia).not.toHaveBeenCalled();
  });

  it.each(["items=0-1", "bytes=0-1,3-4", "bytes=", "bytes=4-3"])(
    "ignores an unsupported GET Range (%s)",
    async (range) => {
      const response = await GET(request({ range }), context);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Range")).toBeNull();
      await expect(response.text()).resolves.toBe("0123456789");
      expect(mocks.openPublicMedia).toHaveBeenCalledWith(media, undefined);
    },
  );

  it.each(["bytes=2-5", "bytes=20-", "not-a-range"])(
    "ignores Range on HEAD (%s)",
    async (range) => {
      const response = await HEAD(request({ range }), context);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Range")).toBeNull();
      expect(response.headers.get("Content-Length")).toBe("10");
      expect(await response.text()).toBe("");
      expect(mocks.validatePublicMedia).toHaveBeenCalledOnce();
      expect(mocks.validatePublicMedia).toHaveBeenCalledWith(media);
      expect(mocks.openPublicMedia).not.toHaveBeenCalled();
    },
  );

  it("maps HEAD metadata validation failures without opening the body", async () => {
    mocks.validatePublicMedia.mockRejectedValue(new Error("MinIO unavailable"));
    const response = await HEAD(request(), context);
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.openPublicMedia).not.toHaveBeenCalled();
  });

  it("maps storage failures to a private 503 response", async () => {
    mocks.openPublicMedia.mockRejectedValue(
      new Error("minio.internal:9000 secret-key"),
    );
    const response = await GET(request(), context);
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("");
  });

  it("bounds concurrent origin streams", async () => {
    const streams: Readable[] = [];
    mocks.openPublicMedia.mockImplementation(async () => {
      const stream = new Readable({ read() {} });
      streams.push(stream);
      return stream;
    });

    const responses = [];
    for (let index = 0; index < 25; index += 1) {
      responses.push(await GET(request(), context));
    }

    expect(
      responses.slice(0, 24).every((response) => response.status === 200),
    ).toBe(true);
    expect(responses[24]?.status).toBe(503);
    expect(responses[24]?.headers.get("Retry-After")).toBe("1");
    expect(mocks.openPublicMedia).toHaveBeenCalledTimes(24);

    for (const stream of streams) stream.destroy();
  });
});
