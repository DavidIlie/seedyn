import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ObjectStore } from "~/server/storage/object-store";
import type * as Classification from "~/server/uploads/classification";

type ClassifiedUpload = Classification.ClassifiedUpload;
type ClassifyUpload = typeof Classification.classifyUpload;
type AssertSize = typeof Classification.assertClassificationSize;
type AssertKind = typeof Classification.assertForcedUploadKind;
type DbCreate = (input: {
  data: Record<string, unknown>;
  include: { variants: boolean };
}) => Promise<Record<string, unknown>>;

const mocks = vi.hoisted(() => ({
  classify: vi.fn<ClassifyUpload>(),
  assertSize: vi.fn<AssertSize>(),
  assertKind: vi.fn<AssertKind>(),
  dbCreate: vi.fn<DbCreate>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("~/env", () => ({
  env: { CDN_URL: "http://i.localhost:3000" },
}));
vi.mock("~/server/db", () => ({
  db: {
    upload: { create: mocks.dbCreate },
  },
}));
vi.mock("~/server/storage/minio", () => ({ objectStore: {} }));
vi.mock("./classification", () => ({
  classifyUpload: mocks.classify,
  assertClassificationSize: mocks.assertSize,
  assertForcedUploadKind: mocks.assertKind,
  sanitizeOriginalName: (value: string) => value,
  validateGifVariant: vi.fn<typeof Classification.validateGifVariant>(),
}));

import { createUpload } from "./service";

const classification = {
  kind: "IMAGE",
  extension: "png",
  contentType: "image/png",
  disposition: "INLINE",
  width: 1,
  height: 1,
  durationMs: null,
  frameCount: 1,
} satisfies ClassifiedUpload;

const file = {
  fieldName: "file",
  originalName: "pixel.png",
  claimedContentType: "image/png",
  path: "/tmp/seedyn-uploads/test.upload",
  byteSize: 68,
  sha256Hex: "ab".repeat(32),
  sniffPrefix: new Uint8Array([137, 80, 78, 71]),
  fields: {},
  dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
};

function objectStore(): { store: ObjectStore; put: ObjectStore["put"] } {
  const put = vi.fn<ObjectStore["put"]>().mockResolvedValue(undefined);
  return {
    put,
    store: {
      put,
      head: vi.fn<ObjectStore["head"]>().mockResolvedValue(null),
      stream: vi.fn<ObjectStore["stream"]>(),
      delete: vi.fn<ObjectStore["delete"]>().mockResolvedValue("deleted"),
      async *listForReconciliation(_prefix: string) {
        // No objects are needed by this unit test.
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.classify.mockResolvedValue(classification);
  mocks.dbCreate.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => {
      const now = new Date("2026-08-17T00:00:00.000Z");
      return {
        ...data,
        byteSize: BigInt(file.byteSize),
        state: "READY",
        createdAt: now,
        updatedAt: now,
        variants: [],
      };
    },
  );
});

describe("createUpload classification reuse", () => {
  it("reuses a route classification and still enforces service assertions", async () => {
    const { store, put } = objectStore();

    await createUpload(
      {
        userId: "user_1",
        file,
        classification,
        forcedKind: "image",
      },
      { store },
    );

    expect(mocks.classify).not.toHaveBeenCalled();
    expect(mocks.assertSize).toHaveBeenCalledWith(file, classification);
    expect(mocks.assertKind).toHaveBeenCalledWith(classification, "image");
    expect(put).toHaveBeenCalledOnce();
  });

  it("classifies inside the service when callers have not already done so", async () => {
    await createUpload(
      { userId: "user_1", file, forcedKind: "auto" },
      { store: objectStore().store },
    );

    expect(mocks.classify).toHaveBeenCalledOnce();
    expect(mocks.classify).toHaveBeenCalledWith(file);
    expect(mocks.assertSize).toHaveBeenCalledWith(file, classification);
    expect(mocks.assertKind).toHaveBeenCalledWith(classification, "auto");
  });
});
