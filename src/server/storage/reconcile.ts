import { assertManagedListPrefix, isManagedObjectKey } from "./keys";
import type { ObjectStore } from "./object-store";

export type StorageConsistencyReport = {
  anomalousObjectKeys: string[];
  orphanObjectKeys: string[];
  missingObjectKeys: string[];
};

/**
 * Read-only reconciliation primitive. It intentionally cannot delete objects.
 * The ObjectStore independently checks both the managed prefix and metadata.
 */
export async function inspectStorageConsistency(input: {
  store: ObjectStore;
  prefix: string;
  expectedKeys: ReadonlySet<string>;
  orphanedBefore?: Date;
}): Promise<StorageConsistencyReport> {
  const prefix = assertManagedListPrefix(input.prefix);
  const seen = new Set<string>();
  const anomalousObjectKeys: string[] = [];
  const orphanObjectKeys: string[] = [];

  for await (const object of input.store.listForReconciliation(prefix)) {
    // Presence and trust are separate facts. An expected object with damaged
    // metadata is anomalous, but it is not missing from object storage.
    seen.add(object.key);
    if (!object.managed) {
      anomalousObjectKeys.push(object.key);
      continue;
    }
    if (
      !input.expectedKeys.has(object.key) &&
      (!input.orphanedBefore || object.lastModified <= input.orphanedBefore)
    ) {
      orphanObjectKeys.push(object.key);
    }
  }

  const missingObjectKeys: string[] = [];
  for (const key of input.expectedKeys) {
    if (!key.startsWith(prefix) || !isManagedObjectKey(key)) {
      throw new TypeError(
        "Expected key is outside the managed reconciliation prefix",
      );
    }
    if (!seen.has(key)) missingObjectKeys.push(key);
  }

  anomalousObjectKeys.sort();
  orphanObjectKeys.sort();
  missingObjectKeys.sort();
  return { anomalousObjectKeys, orphanObjectKeys, missingObjectKeys };
}
