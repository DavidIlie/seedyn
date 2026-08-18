import { describe, expect, it } from "vitest";

import {
  escapePostgresLikePattern,
  normalizeUploadSearchQuery,
} from "./upload-search";

describe("upload filename search", () => {
  it("normalizes, trims, and bounds the visible query", () => {
    expect(normalizeUploadSearchQuery("  cafe\u0301  ")).toBe("café");
    expect(normalizeUploadSearchQuery("x".repeat(101))).toHaveLength(100);
  });

  it("escapes PostgreSQL LIKE metacharacters for literal matching", () => {
    expect(escapePostgresLikePattern("100%_real\\file")).toBe(
      "100\\%\\_real\\\\file",
    );
  });
});
