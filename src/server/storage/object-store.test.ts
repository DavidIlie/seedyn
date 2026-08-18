import { describe, expect, it } from "vitest";

import { matchesManagedMetadata, storageMetadata } from "./object-store";

const expected = {
  recordId: "upload_1",
  kind: "original" as const,
  sha256: "ab".repeat(32),
};

describe("managed object metadata", () => {
  it("binds an object to its exact database record, kind, and digest", () => {
    expect(matchesManagedMetadata(storageMetadata(expected), expected)).toBe(
      true,
    );
    expect(
      matchesManagedMetadata(
        {
          ...storageMetadata(expected),
          "seedyn-record-id": "upload_2",
        },
        expected,
      ),
    ).toBe(false);
    expect(
      matchesManagedMetadata(
        { ...storageMetadata(expected), "seedyn-kind": "gif-variant" },
        expected,
      ),
    ).toBe(false);
    expect(
      matchesManagedMetadata(
        { ...storageMetadata(expected), "seedyn-sha256": "cd".repeat(32) },
        expected,
      ),
    ).toBe(false);
  });

  it("normalizes S3 metadata prefixes and casing", () => {
    const metadata = Object.fromEntries(
      Object.entries(storageMetadata(expected)).map(([key, value]) => [
        `X-Amz-Meta-${key}`,
        value,
      ]),
    );
    expect(matchesManagedMetadata(metadata, expected)).toBe(true);
  });
});
