import { describe, expect, it } from "vitest";

import {
  assertManagedListPrefix,
  gifVariantObjectKey,
  isManagedObjectKey,
  originalObjectKey,
} from "./keys";

const uploadId = "123e4567-e89b-42d3-a456-426614174000";
const variantId = "018f5f5d-a2c7-7b61-8b54-677c62f84e44";

describe("managed storage keys", () => {
  it("builds only the opaque original layout", () => {
    const key = originalObjectKey({
      userId: "user_abc",
      uploadId,
      extension: "PNG",
    });
    expect(key).toBe(`users/user_abc/uploads/${uploadId}/original.png`);
    expect(isManagedObjectKey(key)).toBe(true);
  });

  it("builds the gif variant layout", () => {
    const key = gifVariantObjectKey({
      userId: "user_abc",
      uploadId,
      variantId,
    });
    expect(key).toBe(
      `users/user_abc/uploads/${uploadId}/variants/gif/${variantId}.gif`,
    );
    expect(isManagedObjectKey(key)).toBe(true);
  });

  it("rejects path traversal and caller filenames", () => {
    expect(() =>
      originalObjectKey({ userId: "../victim", uploadId, extension: "png" }),
    ).toThrow("Invalid storage owner id");
    expect(() =>
      originalObjectKey({ userId: "user", uploadId, extension: "png/evil" }),
    ).toThrow("Invalid storage extension");
  });

  it("limits reconciliation to managed roots", () => {
    expect(assertManagedListPrefix("users/")).toBe("users/");
    expect(assertManagedListPrefix("users/user_abc/")).toBe("users/user_abc/");
    expect(() => assertManagedListPrefix("")).toThrow(
      "Refusing to list an unmanaged storage prefix",
    );
    expect(() => assertManagedListPrefix("backups/")).toThrow(
      "Refusing to list an unmanaged storage prefix",
    );
  });
});
