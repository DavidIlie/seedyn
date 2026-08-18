/**
 * Which engine — if any — can turn a given upload into a GIF.
 *
 * The capability matrix in `plans/spec/06-STORAGE-CDN-AND-GIF.md` is the source
 * of truth. Anything that cannot be converted says why, in place, instead of
 * offering a control that fails on click.
 */

export type GifPlan =
  | { engine: "stored" }
  | { engine: "already-gif" }
  | { engine: "still" }
  | { engine: "ffmpeg" }
  | { engine: "none"; reason: string };

const STILL_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
]);

export function planGifConversion(input: {
  uploadKind: string;
  contentType: string;
  hasStoredGif: boolean;
}): GifPlan {
  if (input.hasStoredGif) return { engine: "stored" };
  if (input.contentType === "image/gif") return { engine: "already-gif" };

  if (input.uploadKind === "IMAGE") {
    return STILL_TYPES.has(input.contentType)
      ? { engine: "still" }
      : {
          engine: "none",
          reason: `${input.contentType} images cannot be decoded for GIF conversion in the browser.`,
        };
  }

  if (input.uploadKind === "VIDEO") return { engine: "ffmpeg" };

  return {
    engine: "none",
    reason:
      "GIF variants exist for images and video only. This upload keeps its original URL.",
  };
}
