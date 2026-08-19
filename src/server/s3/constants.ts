export const S3_FIXED_BUCKET = "seedyn";

export const S3_MAX_OBJECT_BYTES = 64 * 1024 * 1024;
export const S3_UPLOAD_TIMEOUT_MS = 110_000;
export const S3_MAX_CLOCK_SKEW_MS = 15 * 60 * 1_000;

export const S3_EMPTY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export type S3Operation =
  | "DeleteObject"
  | "HeadBucket"
  | "HeadObject"
  | "PutObject";
