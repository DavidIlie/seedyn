/**
 * GIF output policy from `plans/spec/06-STORAGE-CDN-AND-GIF.md`.
 *
 * These are the client's own limits. The server validates the produced GIF
 * again — magic bytes, dimensions, and byte cap — and nothing here is trusted
 * on its own.
 */

/** Longest video output edge, aspect ratio preserved. */
export const GIF_MAX_EDGE = 640;

/** Still GIFs retain far more of the source while matching server validation. */
export const GIF_STILL_MAX_WIDTH = 1920;
export const GIF_STILL_MAX_HEIGHT = 1080;

export const GIF_FRAME_RATE = 15;

/** Longest source clip Seedyn will start on. */
export const GIF_MAX_SOURCE_SECONDS = 30;

/** How much of that clip is converted by default. */
export const GIF_DEFAULT_CLIP_SECONDS = 10;

/**
 * 25 MiB, matching `UPLOAD_LIMITS.gif` in `src/server/uploads/multipart.ts`.
 * Output above this is reported and discarded, never uploaded.
 */
export const GIF_MAX_OUTPUT_BYTES = 25 * 1024 * 1024;

/** Self-hosted so CSP, version, and availability stay under Seedyn's control. */
export const FFMPEG_CORE_URL = "/ffmpeg/ffmpeg-core.js";
export const FFMPEG_WASM_URL = "/ffmpeg/ffmpeg-core.wasm";

/**
 * The single-threaded core's on-disk size, stated so the UI can be honest about
 * the download before starting it. Measured from `public/ffmpeg/ffmpeg-core.wasm`
 * (32,232,419 bytes) plus the 112 KB loader; transfer size is lower when the
 * origin serves it compressed.
 */
export const FFMPEG_APPROXIMATE_MB = 31;
