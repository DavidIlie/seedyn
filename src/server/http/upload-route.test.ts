import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiKeyAuthorization from "~/server/api-keys/authorization";
import type * as ApiKeyService from "~/server/api-keys/service";
import type * as RateLimit from "~/server/rate-limit";
import type {
  ClassifiedUpload,
  UploadKindValue,
} from "~/server/uploads/classification";
import type * as Classification from "~/server/uploads/classification";
import type * as Multipart from "~/server/uploads/multipart";
import type * as UploadService from "~/server/uploads/service";

type ResolveApiKeyIdentity = typeof ApiKeyService.resolveApiKeyIdentity;
type ParseAuthorization = typeof ApiKeyAuthorization.parseApiKeyAuthorization;
type CheckRateLimit = typeof RateLimit.checkUploadRateLimit;
type ClassifyUpload = typeof Classification.classifyUpload;
type AssertClassificationSize = typeof Classification.assertClassificationSize;
type AssertForcedUploadKind = typeof Classification.assertForcedUploadKind;
type CreateUpload = (
  ...args: Parameters<typeof UploadService.createUpload>
) => Promise<{
  upload: { id: string; kind: UploadKindValue };
  url: string;
}>;
type ParseMultipartUpload = typeof Multipart.parseMultipartUpload;

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn<ResolveApiKeyIdentity>(),
  authorization: vi.fn<ParseAuthorization>(),
  checkRateLimit: vi.fn<CheckRateLimit>(),
  classify: vi.fn<ClassifyUpload>(),
  assertClassificationSize: vi.fn<AssertClassificationSize>(),
  assertForcedUploadKind: vi.fn<AssertForcedUploadKind>(),
  createUpload: vi.fn<CreateUpload>(),
  parseMultipart: vi.fn<ParseMultipartUpload>(),
  sourceAddress: vi.fn<() => string | null>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("~/env", () => ({
  env: {
    APP_HOSTS: "seedyn.localhost",
    MEDIA_HOSTS: "i.localhost",
    APP_URL: "http://seedyn.localhost:3000",
    AUTH_SECRET: "test-secret",
    NODE_ENV: "development",
    TRUSTED_PROXY_HOPS: 1,
  },
}));
vi.mock("~/server/rate-limit", () => ({
  extractClientAddress: mocks.sourceAddress,
  checkUploadRateLimit: mocks.checkRateLimit,
}));
vi.mock("~/server/api-keys/authorization", () => ({
  parseApiKeyAuthorization: mocks.authorization,
}));
vi.mock("~/server/api-keys/service", () => ({
  resolveApiKeyIdentity: mocks.authenticate,
}));
vi.mock("~/server/uploads/classification", () => ({
  classifyUpload: mocks.classify,
  assertClassificationSize: mocks.assertClassificationSize,
  assertForcedUploadKind: mocks.assertForcedUploadKind,
}));
vi.mock("~/server/uploads/multipart", () => ({
  parseMultipartUpload: mocks.parseMultipart,
  UPLOAD_LIMITS: {
    generic: 64 * 1024 * 1024,
    imageOrText: 16 * 1024 * 1024,
  },
}));
vi.mock("~/server/uploads/service", () => ({
  createUpload: mocks.createUpload,
}));

import { handleMachineUpload } from "./upload-route";

const allowedRateLimit = {
  allowed: true as const,
  status: 200 as const,
  limit: 60,
  remaining: 59,
  resetAt: 2_000,
  retryAfterSeconds: 1,
  headers: {
    "RateLimit-Limit": "60",
    "RateLimit-Remaining": "59",
    "RateLimit-Reset": "2",
    "Retry-After": "1",
  },
};

const imageClassification = {
  kind: "IMAGE",
  extension: "png",
  contentType: "image/png",
  disposition: "INLINE",
  width: 1,
  height: 1,
  durationMs: null,
  frameCount: 1,
} satisfies ClassifiedUpload;

function uploadRequest(
  path = "/api/upload",
  headers: HeadersInit = {},
): Request {
  const merged = new Headers({
    authorization: "Bearer seedyn_test_key",
    "content-length": "100",
    "content-type": "multipart/form-data; boundary=test",
    host: "seedyn.localhost:3000",
    ...Object.fromEntries(new Headers(headers)),
  });
  return new Request(`http://seedyn.localhost:3000${path}`, {
    method: "POST",
    headers: merged,
    body: "not-read-by-the-test-parser",
  });
}

function parsedFile() {
  return {
    fieldName: "file",
    originalName: "image.png",
    claimedContentType: "image/png",
    path: "/tmp/test-upload",
    byteSize: 100,
    sha256Hex: "ab".repeat(32),
    sniffPrefix: new Uint8Array([137, 80, 78, 71]),
    fields: {},
    dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorization.mockReturnValue("seedyn_test_key");
  mocks.sourceAddress.mockReturnValue("127.0.0.1");
  mocks.checkRateLimit.mockResolvedValue(allowedRateLimit);
  mocks.authenticate.mockResolvedValue({
    id: "key_1",
    userId: "user_1",
    prefix: "seedyn_test",
    scopes: ["upload:image", "upload:file", "upload:text"],
  });
  mocks.classify.mockResolvedValue(imageClassification);
  mocks.parseMultipart.mockResolvedValue(parsedFile());
  mocks.createUpload.mockResolvedValue({
    upload: { id: "upload_1", kind: "IMAGE" },
    url: "http://i.localhost:3000/AbCdEfGhIjKlMnOpQrStUv.png",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("machine upload boundary", () => {
  it("rejects hostile hosts and query-string keys before auth or body parsing", async () => {
    const hostile = uploadRequest("/api/upload", { host: "attacker.test" });
    expect(
      await handleMachineUpload(hostile, {
        fileField: "file",
        forcedKind: "auto",
        legacy: false,
      }),
    ).toMatchObject({ status: 404 });
    expect(mocks.authorization).not.toHaveBeenCalled();
    expect(mocks.parseMultipart).not.toHaveBeenCalled();

    const queryKey = uploadRequest("/api/upload?key=leaked-secret");
    const response = await handleMachineUpload(queryKey, {
      fileField: "file",
      forcedKind: "auto",
      legacy: false,
    });
    expect(response.status).toBe(401);
    expect(mocks.authorization).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.parseMultipart).not.toHaveBeenCalled();
  });

  it("completes authentication and both rate limits before touching the body", async () => {
    const order: string[] = [];
    mocks.authorization.mockImplementation(() => {
      order.push("authorization");
      return "seedyn_test_key";
    });
    mocks.checkRateLimit.mockImplementation(
      async (input: { apiKeyId: string }) => {
        order.push(`rate:${input.apiKeyId}`);
        return allowedRateLimit;
      },
    );
    mocks.authenticate.mockImplementation(async () => {
      order.push("authenticate");
      return {
        id: "key_1",
        userId: "user_1",
        prefix: "seedyn_test",
        scopes: ["upload:image"],
      };
    });
    mocks.parseMultipart.mockImplementation(async () => {
      order.push("body");
      return parsedFile();
    });

    const response = await handleMachineUpload(uploadRequest(), {
      fileField: "file",
      forcedKind: "auto",
      legacy: false,
    });
    expect(response.status).toBe(201);
    expect(order).toEqual([
      "authorization",
      "rate:api-key-authentication-source",
      "rate:api-key-authentication-candidate",
      "authenticate",
      "rate:machine-upload-source",
      "rate:machine-upload-account",
      "body",
    ]);
  });

  it("does not authenticate or parse a body after an auth-candidate rate failure", async () => {
    mocks.checkRateLimit.mockResolvedValueOnce({
      allowed: false,
      status: 429,
      reason: "rate_limited",
      limit: 30,
      remaining: 0,
      resetAt: 5_000,
      retryAfterSeconds: 3,
      headers: {
        "RateLimit-Limit": "30",
        "RateLimit-Remaining": "0",
        "RateLimit-Reset": "5",
        "Retry-After": "3",
      },
    });
    const response = await handleMachineUpload(uploadRequest(), {
      fileField: "file",
      forcedKind: "auto",
      legacy: false,
    });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("3");
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(mocks.parseMultipart).not.toHaveBeenCalled();
  });

  it("does not rate-limit or parse a body without a valid auth candidate", async () => {
    mocks.authorization.mockReturnValue(null);
    const response = await handleMachineUpload(uploadRequest(), {
      fileField: "file",
      forcedKind: "auto",
      legacy: false,
    });
    expect(response.status).toBe(401);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(mocks.parseMultipart).not.toHaveBeenCalled();
  });

  it("reports proxy address failures as rate-limit unavailability", async () => {
    mocks.sourceAddress.mockReturnValue(null);

    const response = await handleMachineUpload(uploadRequest(), {
      fileField: "file",
      forcedKind: "auto",
      legacy: false,
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "rate_limit_unavailable" },
    });
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it("reports API-key database failures as database unavailability", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.authenticate.mockRejectedValue(new Error("database offline"));

    const response = await handleMachineUpload(uploadRequest(), {
      fileField: "file",
      forcedKind: "auto",
      legacy: false,
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "database_unavailable" },
    });
    expect(log).toHaveBeenCalledOnce();
    expect(mocks.parseMultipart).not.toHaveBeenCalled();
  });

  it("rejects oversized declared bodies after auth but before multipart parsing", async () => {
    const response = await handleMachineUpload(
      uploadRequest("/api/upload", {
        "content-length": String(64 * 1024 * 1024 + 128 * 1024 + 1),
      }),
      { fileField: "file", forcedKind: "auto", legacy: false },
    );
    expect(response.status).toBe(413);
    expect(mocks.authenticate).toHaveBeenCalledOnce();
    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(4);
    expect(mocks.parseMultipart).not.toHaveBeenCalled();
  });

  it("enforces the server-classified scope and always disposes temporary files", async () => {
    const file = parsedFile();
    mocks.parseMultipart.mockResolvedValue(file);
    mocks.authenticate.mockResolvedValue({
      id: "key_1",
      userId: "user_1",
      prefix: "seedyn_test",
      scopes: ["upload:file"],
    });
    mocks.classify.mockResolvedValue(imageClassification);

    const response = await handleMachineUpload(uploadRequest(), {
      fileField: "file",
      forcedKind: "auto",
      legacy: false,
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "missing_scope" },
    });
    expect(mocks.createUpload).not.toHaveBeenCalled();
    expect(file.dispose).toHaveBeenCalledOnce();
  });

  it.each([
    {
      path: "/api/images",
      route: {
        fileField: "image" as const,
        forcedKind: "image" as const,
        legacy: true,
      },
      wrongScope: "upload:file" as const,
    },
    {
      path: "/api/files",
      route: {
        fileField: "file" as const,
        forcedKind: "file" as const,
        legacy: true,
      },
      wrongScope: "upload:text" as const,
    },
    {
      path: "/api/texts",
      route: {
        fileField: "text" as const,
        forcedKind: "text" as const,
        legacy: true,
      },
      wrongScope: "upload:image" as const,
    },
  ])("rejects the fixed legacy scope before reading $path", async (input) => {
    mocks.authenticate.mockResolvedValue({
      id: "key_1",
      userId: "user_1",
      prefix: "seedyn_test",
      scopes: [input.wrongScope],
    });

    const response = await handleMachineUpload(
      uploadRequest(input.path),
      input.route,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "missing_scope" },
    });
    expect(mocks.parseMultipart).not.toHaveBeenCalled();
    expect(mocks.classify).not.toHaveBeenCalled();
  });

  it("uses the fixed file scope after classifying a legacy file-route image", async () => {
    mocks.authenticate.mockResolvedValue({
      id: "key_1",
      userId: "user_1",
      prefix: "seedyn_test",
      scopes: ["upload:file"],
    });
    mocks.classify.mockResolvedValue(imageClassification);

    const response = await handleMachineUpload(uploadRequest("/api/files"), {
      fileField: "file",
      forcedKind: "file",
      legacy: true,
    });

    expect(response.status).toBe(200);
    expect(mocks.parseMultipart).toHaveBeenCalledOnce();
    expect(mocks.createUpload).toHaveBeenCalledWith(
      expect.objectContaining({ classification: imageClassification }),
    );
  });

  it("does not expose unexpected parser failures", async () => {
    mocks.parseMultipart.mockRejectedValue(
      new Error("MINIO_PASSWORD=should-never-leak"),
    );
    const response = await handleMachineUpload(uploadRequest(), {
      fileField: "file",
      forcedKind: "auto",
      legacy: false,
    });
    expect(response.status).toBe(500);
    const body = JSON.stringify(await response.json());
    expect(body).toContain("An internal error occurred.");
    expect(body).not.toContain("MINIO_PASSWORD");
    expect(body).not.toContain("should-never-leak");
  });

  it("keeps legacy raw authorization opt-in and the exact ShareX response", async () => {
    const response = await handleMachineUpload(uploadRequest("/api/images"), {
      fileField: "image",
      forcedKind: "image",
      legacy: true,
    });
    expect(mocks.authorization).toHaveBeenCalledWith("Bearer seedyn_test_key", {
      allowLegacyRaw: true,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "http://i.localhost:3000/AbCdEfGhIjKlMnOpQrStUv.png",
    });
    expect(response.headers.get("Retry-After")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.createUpload).toHaveBeenCalledWith(
      expect.objectContaining({ classification: imageClassification }),
    );
  });
});
