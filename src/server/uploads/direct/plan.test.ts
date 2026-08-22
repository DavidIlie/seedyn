import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DomainError } from "~/server/uploads/errors";
import { UPLOAD_LIMITS } from "~/server/uploads/multipart";

import {
  canTransitionDirectUpload,
  classifyDirectUploadPrefix,
  DIRECT_UPLOAD_PART_BYTES,
  directUploadPartCount,
  directUploadPlan,
  expectedDirectUploadPartBytes,
  validateDirectPartNumbers,
  validateObservedUploadParts,
} from "./plan";

void describe("direct upload planning", () => {
  void it("separates the legacy ceiling from the direct-upload ceiling", () => {
    assert.throws(
      () => directUploadPlan(UPLOAD_LIMITS.generic, 2 * 1024 ** 3),
      DomainError,
    );
    const first = directUploadPlan(UPLOAD_LIMITS.generic + 1, 2 * 1024 ** 3);
    assert.equal(first.partCount, 5);
    assert.equal(first.partSize, 16 * 1024 ** 2);

    const maximum = directUploadPlan(2 * 1024 ** 3, 2 * 1024 ** 3);
    assert.equal(maximum.partCount, 128);
    assert.throws(
      () => directUploadPlan(2 * 1024 ** 3 + 1, 2 * 1024 ** 3),
      DomainError,
    );
  });

  void it("enforces S3 part arithmetic through the 10,000-part boundary", () => {
    assert.equal(directUploadPartCount(DIRECT_UPLOAD_PART_BYTES), 1);
    assert.equal(directUploadPartCount(DIRECT_UPLOAD_PART_BYTES + 1), 2);
    assert.equal(
      directUploadPartCount(DIRECT_UPLOAD_PART_BYTES * 10_000),
      10_000,
    );
    assert.equal(
      expectedDirectUploadPartBytes({
        byteSize: DIRECT_UPLOAD_PART_BYTES * 4 + 1,
        partSize: DIRECT_UPLOAD_PART_BYTES,
        partCount: 5,
        partNumber: 5,
      }),
      1,
    );
  });

  void it("accepts only a complete, ordered, exact-size storage manifest", () => {
    const byteSize = DIRECT_UPLOAD_PART_BYTES * 2 + 7;
    const parts = [
      { partNumber: 2, byteSize: DIRECT_UPLOAD_PART_BYTES, eTag: '"b"' },
      { partNumber: 1, byteSize: DIRECT_UPLOAD_PART_BYTES, eTag: '"a"' },
      { partNumber: 3, byteSize: 7, eTag: '"c"' },
    ];
    assert.deepEqual(
      validateObservedUploadParts({
        byteSize,
        partSize: DIRECT_UPLOAD_PART_BYTES,
        partCount: 3,
        parts,
      }).map((part) => part.partNumber),
      [1, 2, 3],
    );
    assert.throws(
      () =>
        validateObservedUploadParts({
          byteSize,
          partSize: DIRECT_UPLOAD_PART_BYTES,
          partCount: 3,
          parts: parts.slice(0, 2),
        }),
      DomainError,
    );
    assert.throws(
      () =>
        validateObservedUploadParts({
          byteSize,
          partSize: DIRECT_UPLOAD_PART_BYTES,
          partCount: 3,
          parts: parts.map((part) =>
            part.partNumber === 3
              ? { partNumber: 3, byteSize: 8, eTag: part.eTag }
              : part,
          ),
        }),
      DomainError,
    );
  });

  void it("bounds and de-duplicates each signing request", () => {
    assert.deepEqual(validateDirectPartNumbers([3, 1, 2], 3), [1, 2, 3]);
    assert.throws(() => validateDirectPartNumbers([1, 1], 3), DomainError);
    assert.throws(() => validateDirectPartNumbers([0], 3), DomainError);
    assert.throws(
      () =>
        validateDirectPartNumbers(
          Array.from({ length: 13 }, (_, i) => i + 1),
          20,
        ),
      DomainError,
    );
  });
});

void describe("direct upload classification", () => {
  void it("accepts a signed video prefix and rejects an oversized image", async () => {
    const mp4 = Buffer.alloc(64);
    mp4.writeUInt32BE(24, 0);
    mp4.write("ftyp", 4, "ascii");
    mp4.write("isom", 8, "ascii");
    const video = await classifyDirectUploadPrefix(mp4);
    assert.deepEqual(video, {
      kind: "VIDEO",
      extension: "mp4",
      contentType: "video/mp4",
      disposition: "INLINE",
    });

    const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    await assert.rejects(() => classifyDirectUploadPrefix(png), DomainError);
  });
});

void describe("direct upload states", () => {
  void it("permits only the explicit lifecycle edges", () => {
    assert.equal(canTransitionDirectUpload("CREATING", "UPLOADING"), true);
    assert.equal(canTransitionDirectUpload("UPLOADING", "VERIFYING"), true);
    assert.equal(canTransitionDirectUpload("VERIFYING", "PUBLISHED"), true);
    assert.equal(canTransitionDirectUpload("UPLOADING", "PUBLISHED"), false);
    assert.equal(canTransitionDirectUpload("PUBLISHED", "ABORTING"), false);
    assert.equal(canTransitionDirectUpload("ABORTED", "UPLOADING"), false);
  });
});
