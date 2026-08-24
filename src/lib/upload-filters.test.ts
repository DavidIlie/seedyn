import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  countActiveUploadFilters,
  EMPTY_UPLOAD_FILTERS,
  NO_CREDENTIAL,
  parseByteSize,
  parseUploadFilters,
  readerFromUrlSearchParams,
  uploadFilterKey,
  uploadFilterParams,
  type UploadFilters,
} from "./upload-filters";

function parse(search: string): UploadFilters {
  return parseUploadFilters(
    readerFromUrlSearchParams(new URLSearchParams(search)),
  );
}

void describe("parseByteSize", () => {
  void it("reads a bare byte count", () => {
    assert.equal(parseByteSize("2048"), 2048);
  });

  void it("counts unit suffixes in thousands, matching what the library prints", () => {
    assert.equal(parseByteSize("10mb"), 10_000_000);
    assert.equal(parseByteSize("1.5 GB"), 1_500_000_000);
    assert.equal(parseByteSize("500 KB"), 500_000);
  });

  void it("honours the binary spellings when they are asked for", () => {
    assert.equal(parseByteSize("1MiB"), 1_048_576);
    assert.equal(parseByteSize("2 gib"), 2_147_483_648);
  });

  void it("round-trips the string formatBytes would print", () => {
    assert.equal(parseByteSize("10.0 MB"), 10_000_000);
  });

  void it("rejects what it cannot understand rather than guessing", () => {
    for (const input of ["", "  ", "abc", "10 parsecs", "-5mb", "1e9", "NaN"]) {
      assert.equal(parseByteSize(input), null, `expected null for "${input}"`);
    }
  });

  void it("rejects an amount too large to be an exact integer", () => {
    assert.equal(parseByteSize("99999999 tb"), null);
  });
});

void describe("parseUploadFilters", () => {
  void it("defaults to an unfiltered newest-first view", () => {
    assert.deepEqual(parse(""), EMPTY_UPLOAD_FILTERS);
    assert.equal(countActiveUploadFilters(parse("")), 0);
  });

  void it("reads every dimension", () => {
    const filters = parse(
      "q=Report&order=oldest&key=abc123&origin=sharex&from=2026-01-05&to=2026-02-01&min=500kb&max=10mb",
    );
    assert.deepEqual(filters, {
      query: "Report",
      order: "oldest",
      credential: "abc123",
      origin: "SHAREX",
      from: "2026-01-05",
      to: "2026-02-01",
      minSize: 500_000,
      maxSize: 10_000_000,
    });
    assert.equal(countActiveUploadFilters(filters), 7);
  });

  void it("keeps the no-credential sentinel distinct from 'any credential'", () => {
    assert.equal(parse(`key=${NO_CREDENTIAL}`).credential, NO_CREDENTIAL);
    assert.equal(parse("").credential, "");
  });

  void it("degrades an unusable value to 'not filtered' instead of erroring", () => {
    // These are user-editable URL values that reach a database query.
    assert.equal(parse("origin=DROP TABLE").origin, "");
    assert.equal(parse("key=' OR 1=1--").credential, "");
    assert.equal(parse("from=2026-13-45").from, "");
    assert.equal(parse("from=not-a-date").from, "");
    assert.equal(parse("min=huge").minSize, null);
  });

  void it("rejects a date that does not exist on the calendar", () => {
    assert.equal(parse("from=2026-02-30").from, "");
    assert.equal(parse("from=2024-02-29").from, "2024-02-29");
  });

  void it("caps a very long search the same way the database filter does", () => {
    assert.equal(parse(`q=${"a".repeat(300)}`).query.length, 100);
  });
});

void describe("uploadFilterParams", () => {
  void it("omits defaults so an unfiltered library keeps a bare URL", () => {
    assert.equal(uploadFilterParams(EMPTY_UPLOAD_FILTERS).toString(), "");
  });

  void it("round-trips through a query string unchanged", () => {
    const original = parse(
      "q=notes&order=oldest&key=abc123&origin=S3&from=2026-01-05&to=2026-02-01&min=1024&max=10mb",
    );
    assert.deepEqual(parse(uploadFilterParams(original).toString()), original);
  });

  void it("gives equivalent filter sets the same cache key", () => {
    // Same meaning, different spellings: unit case, size units, origin case.
    assert.equal(
      uploadFilterKey(parse("min=10mb&origin=sharex")),
      uploadFilterKey(parse("min=10MB&origin=SHAREX")),
    );
    assert.equal(
      uploadFilterKey(parse("min=1mib")),
      uploadFilterKey(parse("min=1048576")),
    );
  });

  void it("does not count ordering as a narrowing filter", () => {
    assert.equal(countActiveUploadFilters(parse("order=oldest")), 0);
  });
});
