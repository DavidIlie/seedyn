import { Readable } from "node:stream";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ObjectStore } from "~/server/storage/object-store";
import { storageMetadata } from "~/server/storage/object-store";

const database = vi.hoisted(() => ({
  findOriginal: vi.fn<(input?: unknown) => Promise<unknown>>(),
  findVariant: vi.fn<(input?: unknown) => Promise<unknown>>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("~/server/db", () => ({
  db: {
    upload: { findFirst: database.findOriginal },
    uploadVariant: { findFirst: database.findVariant },
  },
}));
vi.mock("~/server/storage/minio", () => ({ objectStore: {} }));

import {
  findPublicMedia,
  openPublicMedia,
  type PublicMediaRecord,
  validatePublicMedia,
} from "./public-media";

const sha256 = new Uint8Array(32).fill(0xab);
const media: PublicMediaRecord = {
  id: "variant_1",
  publicSlug: "AbCdEfGhIjKlMnOpQrStUv",
  extension: "gif",
  storageKey: "users/u/uploads/x/variant.gif",
  storageKind: "gif-variant",
  byteSize: 10,
  contentType: "image/gif",
  disposition: "INLINE",
  originalName: "clip.gif",
  sha256,
  createdAt: new Date("2026-08-17T12:00:00Z"),
};

function fakeStore() {
  const head = vi.fn<ObjectStore["head"]>(async () => ({
    key: media.storageKey,
    byteSize: media.byteSize,
    lastModified: media.createdAt,
    metadata: storageMetadata({
      recordId: media.id,
      kind: media.storageKind,
      sha256: Buffer.from(media.sha256).toString("hex"),
    }),
  }));
  const stream = vi.fn<ObjectStore["stream"]>(async () =>
    Readable.from("0123456789"),
  );
  const store: ObjectStore = {
    put: async () => undefined,
    head,
    stream,
    delete: async () => "missing",
    async *listForReconciliation() {
      yield* [];
    },
  };
  return { store, head, stream };
}

beforeEach(() => {
  vi.clearAllMocks();
  database.findOriginal.mockResolvedValue(null);
  database.findVariant.mockResolvedValue(null);
});

describe("public media records", () => {
  it("serves a GIF variant with a filename whose extension matches its bytes", async () => {
    database.findVariant.mockResolvedValue({
      id: media.id,
      publicSlug: media.publicSlug,
      extension: media.extension,
      storageKey: media.storageKey,
      byteSize: BigInt(media.byteSize),
      contentType: media.contentType,
      disposition: media.disposition,
      sha256: Buffer.from(media.sha256),
      createdAt: media.createdAt,
      upload: { originalName: "holiday.clip.mp4" },
    });

    await expect(
      findPublicMedia(media.publicSlug, media.extension),
    ).resolves.toMatchObject({
      storageKind: "gif-variant",
      originalName: "holiday.clip.gif",
      extension: "gif",
      contentType: "image/gif",
    });
  });

  it("validates HEAD metadata without opening an object stream", async () => {
    const { store, head, stream } = fakeStore();
    await expect(validatePublicMedia(media, store)).resolves.toBeUndefined();
    expect(head).toHaveBeenCalledOnce();
    expect(stream).not.toHaveBeenCalled();
  });

  it("validates metadata before opening a GET stream", async () => {
    const { store, head, stream } = fakeStore();
    await expect(
      openPublicMedia(media, undefined, store),
    ).resolves.toBeDefined();
    expect(head).toHaveBeenCalledOnce();
    expect(stream).toHaveBeenCalledWith(media.storageKey, undefined);
  });
});
