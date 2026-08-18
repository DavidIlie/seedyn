import { Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import type {
  ManagedObjectSummary,
  ObjectStore,
  PutObjectInput,
} from "./object-store";
import { inspectStorageConsistency } from "./reconcile";

const present =
  "users/user_abc/uploads/123e4567-e89b-42d3-a456-426614174000/original.png";
const orphan =
  "users/user_abc/uploads/123e4567-e89b-42d3-a456-426614174001/original.png";
const missing =
  "users/user_abc/uploads/123e4567-e89b-42d3-a456-426614174002/original.png";

function fakeStore(
  objects: Array<{ key: string; managed?: boolean; lastModified?: Date }>,
): ObjectStore {
  return {
    put: async (_input: PutObjectInput) => undefined,
    head: async () => null,
    stream: async () => Readable.from([]),
    delete: async () => "missing",
    async *listForReconciliation(): AsyncIterable<ManagedObjectSummary> {
      for (const object of objects) {
        yield {
          key: object.key,
          byteSize: 1,
          lastModified: object.lastModified ?? new Date(0),
          metadata: {},
          managed: object.managed ?? true,
        };
      }
    },
  };
}

describe("read-only storage reconciliation", () => {
  it("reports managed orphan and missing keys without deleting", async () => {
    const store = fakeStore([{ key: present }, { key: orphan }]);
    const deleteSpy = vi.spyOn(store, "delete");
    await expect(
      inspectStorageConsistency({
        store,
        prefix: "users/",
        expectedKeys: new Set([present, missing]),
      }),
    ).resolves.toEqual({
      anomalousObjectKeys: [],
      orphanObjectKeys: [orphan],
      missingObjectKeys: [missing],
    });
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("refuses an unmanaged listing prefix before iteration", async () => {
    await expect(
      inspectStorageConsistency({
        store: fakeStore([]),
        prefix: "backups/",
        expectedKeys: new Set(),
      }),
    ).rejects.toThrow("unmanaged");
  });

  it("reports malformed objects and defers young orphan candidates", async () => {
    const recent = new Date("2026-08-17T12:00:00Z");
    await expect(
      inspectStorageConsistency({
        store: fakeStore([
          { key: orphan, lastModified: recent },
          { key: "users/stray-object", managed: false },
        ]),
        prefix: "users/",
        expectedKeys: new Set(),
        orphanedBefore: new Date("2026-08-17T11:59:59Z"),
      }),
    ).resolves.toEqual({
      anomalousObjectKeys: ["users/stray-object"],
      orphanObjectKeys: [],
      missingObjectKeys: [],
    });
  });

  it("does not also report an expected anomalous object as missing", async () => {
    await expect(
      inspectStorageConsistency({
        store: fakeStore([{ key: present, managed: false }]),
        prefix: "users/",
        expectedKeys: new Set([present]),
      }),
    ).resolves.toEqual({
      anomalousObjectKeys: [present],
      orphanObjectKeys: [],
      missingObjectKeys: [],
    });
  });
});
