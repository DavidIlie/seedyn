import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createPublicSlug, isPublicSlug } from "./identifiers";

void describe("public upload identifiers", () => {
  void it("always creates a route-safe slug with 192 random bits", () => {
    const slugs = Array.from({ length: 256 }, () => createPublicSlug());
    assert.equal(new Set(slugs).size, slugs.length);
    for (const slug of slugs) {
      assert.equal(slug.length, 34);
      assert.equal(isPublicSlug(slug), true);
      assert.match(slug, /^[A-Za-z0-9].*[A-Za-z0-9]$/u);
    }
  });
});
