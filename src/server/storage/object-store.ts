import type { Readable } from "node:stream";

import { assertManagedListPrefix, isManagedObjectKey } from "./keys";

export const STORAGE_SCHEMA_VERSION = "1";

export type StoredObjectKind = "original" | "gif-variant";

export type ManagedObjectMetadata = {
  recordId: string;
  kind: StoredObjectKind;
  sha256: string;
};

export type PutObjectInput = {
  key: string;
  filePath: string;
  byteSize: number;
  contentType: string;
  metadata: ManagedObjectMetadata;
  signal?: AbortSignal;
};

export type ByteRange = {
  start: number;
  end: number;
  length: number;
};

export type ObjectHead = {
  key: string;
  byteSize: number;
  lastModified: Date;
  metadata: Readonly<Record<string, string>>;
};

export type ManagedObjectSummary = {
  key: string;
  byteSize: number;
  lastModified: Date;
  metadata: Readonly<Record<string, string>>;
  managed: boolean;
};

export type ObjectStore = {
  put(input: PutObjectInput): Promise<void>;
  head(key: string): Promise<ObjectHead | null>;
  stream(key: string, range?: ByteRange): Promise<Readable>;
  delete(key: string): Promise<"deleted" | "missing">;
  listForReconciliation(prefix: string): AsyncIterable<ManagedObjectSummary>;
};

export function storageMetadata(
  metadata: ManagedObjectMetadata,
): Readonly<Record<string, string>> {
  return {
    "seedyn-managed": "true",
    "seedyn-schema": STORAGE_SCHEMA_VERSION,
    "seedyn-record-id": metadata.recordId,
    "seedyn-kind": metadata.kind,
    "seedyn-sha256": metadata.sha256,
  };
}

export function isManagedMetadata(
  metadata: Readonly<Record<string, string>>,
): boolean {
  const normalized = normalizeStorageMetadata(metadata);
  return (
    normalized["seedyn-managed"] === "true" &&
    normalized["seedyn-schema"] === STORAGE_SCHEMA_VERSION
  );
}

export function matchesManagedMetadata(
  metadata: Readonly<Record<string, unknown>>,
  expected: ManagedObjectMetadata,
): boolean {
  const normalized = normalizeStorageMetadata(metadata);
  return (
    isManagedMetadata(normalized) &&
    normalized["seedyn-record-id"] === expected.recordId &&
    normalized["seedyn-kind"] === expected.kind &&
    normalized["seedyn-sha256"] === expected.sha256
  );
}

export function normalizeStorageMetadata(
  metadata: Readonly<Record<string, unknown>>,
): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(metadata)) {
    if (typeof rawValue !== "string") continue;
    const key = rawKey.toLowerCase().replace(/^x-amz-meta-/, "");
    output[key] = rawValue;
  }
  return output;
}

export function validateManagedListing(prefix: string, key: string): void {
  assertManagedListPrefix(prefix);
  if (!key.startsWith(prefix) || !isManagedObjectKey(key)) {
    throw new TypeError(
      "Storage returned an object outside the managed prefix",
    );
  }
}
