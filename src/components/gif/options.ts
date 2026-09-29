/**
 * GIF output policy from `plans/spec/06-STORAGE-CDN-AND-GIF.md`.
 *
 * These are the client's own limits. The server validates the produced GIF
 * again — magic bytes, dimensions, and byte cap — and nothing here is trusted
 * on its own.
 */

/** Still GIFs retain far more of the source while matching server validation. */
export const GIF_STILL_MAX_WIDTH = 1920;
export const GIF_STILL_MAX_HEIGHT = 1080;

/**
 * `validateGifVariant` rejects anything over 120 frames or 60 seconds, so the
 * editor budgets frames before encoding instead of letting the server refuse
 * a finished GIF.
 */
export const GIF_MAX_FRAMES = 120;
export const GIF_MAX_PLAYBACK_SECONDS = 60;

export const GIF_FRAME_RATES = [5, 10, 12, 15, 20, 25] as const;
/** Longest output edge; aspect ratio is preserved and nothing is upscaled. */
export const GIF_SIZES = [240, 320, 480, 640, 800] as const;
export const GIF_SPEEDS = [0.5, 1, 1.5, 2, 3] as const;

export type VideoGifSettings = {
  /** Seconds into the source. */
  start: number;
  end: number;
  fps: number;
  maxEdge: number;
  speed: number;
  loop: boolean;
};

export const GIF_DEFAULT_SETTINGS: Omit<VideoGifSettings, "start" | "end"> = {
  fps: 12,
  maxEdge: 480,
  speed: 1,
  loop: true,
};

/** Seconds the GIF plays for once speed is applied. */
export function gifPlaybackSeconds(settings: VideoGifSettings): number {
  return Math.max(0, settings.end - settings.start) / settings.speed;
}

export function gifFrameCount(settings: VideoGifSettings): number {
  // Tenths of a second do not add exactly in floating point; 4.8 s at 25 fps
  // must count as 120 frames, not 121.
  return Math.ceil(gifPlaybackSeconds(settings) * settings.fps - 1e-6);
}

/** The longest source span that still fits the frame budget. */
export function gifMaxSourceSeconds(
  settings: Pick<VideoGifSettings, "fps" | "speed">,
): number {
  return Math.min(
    (GIF_MAX_FRAMES / settings.fps) * settings.speed,
    GIF_MAX_PLAYBACK_SECONDS * settings.speed,
  );
}

/**
 * 25 MiB, matching `UPLOAD_LIMITS.gif` in `src/server/uploads/multipart.ts`.
 * Output above this is reported and discarded, never uploaded.
 */
export const GIF_MAX_OUTPUT_BYTES = 25 * 1024 * 1024;

/** Self-hosted so CSP, version, and availability stay under Seedyn's control. */
export const FFMPEG_CORE_URL = "/ffmpeg/ffmpeg-core.js";
export const FFMPEG_WASM_URL = "/ffmpeg/ffmpeg-core.wasm";
/** Unbundled, so its dynamic `import()` of the core reaches the browser intact. */
export const FFMPEG_WORKER_URL = "/ffmpeg/worker.js";

/**
 * The single-threaded core's on-disk size, stated so the UI can be honest about
 * the download before starting it. Measured from `public/ffmpeg/ffmpeg-core.wasm`
 * (32,232,419 bytes) plus the 112 KB loader; transfer size is lower when the
 * origin serves it compressed.
 */
export const FFMPEG_APPROXIMATE_MB = 31;
