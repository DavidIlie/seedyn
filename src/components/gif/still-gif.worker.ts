/// <reference lib="webworker" />

import { applyPalette, GIFEncoder, quantize } from "gifenc";

import { GIF_MAX_EDGE } from "./options";

/**
 * Single-frame GIF encoding for still images.
 *
 * This is the common path and it deliberately does not touch ffmpeg: a PNG
 * screenshot needs a quantizer, not a 31 MB codec bundle. It runs off the main
 * thread because `quantize` over a few megapixels blocks long enough to drop
 * frames and freeze the copy button.
 */

export type StillRequest = {
  bytes: ArrayBuffer;
  contentType: string;
};

export type StillResponse =
  | { ok: true; bytes: ArrayBuffer; width: number; height: number }
  | { ok: false; message: string };

function scaleTo(width: number, height: number) {
  const longest = Math.max(width, height);
  if (longest <= GIF_MAX_EDGE) return { width, height };
  const ratio = GIF_MAX_EDGE / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

self.onmessage = async (event: MessageEvent<StillRequest>) => {
  const scope = self as unknown as DedicatedWorkerGlobalScope;
  let bitmap: ImageBitmap | null = null;
  try {
    const blob = new Blob([event.data.bytes], { type: event.data.contentType });
    bitmap = await createImageBitmap(blob);
    const size = scaleTo(bitmap.width, bitmap.height);

    const canvas = new OffscreenCanvas(size.width, size.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("This browser refused a 2D canvas context.");
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const frame = context.getImageData(0, 0, size.width, size.height);

    // `rgba4444` keeps the alpha channel through quantisation; GIF then reduces
    // it to the one bit the format actually has.
    const palette = quantize(frame.data, 256, {
      format: "rgba4444",
      oneBitAlpha: true,
    });
    const indexed = applyPalette(frame.data, palette, "rgba4444");
    const transparentIndex = palette.findIndex((color) => color[3] === 0);

    const encoder = GIFEncoder();
    encoder.writeFrame(indexed, size.width, size.height, {
      palette,
      transparent: transparentIndex >= 0,
      transparentIndex: Math.max(0, transparentIndex),
    });
    encoder.finish();

    const bytes = encoder.bytes();
    const output = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;

    const response: StillResponse = {
      ok: true,
      bytes: output,
      width: size.width,
      height: size.height,
    };
    scope.postMessage(response, [output]);
  } catch (error) {
    const response: StillResponse = {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "The image could not be decoded in this browser.",
    };
    scope.postMessage(response);
  } finally {
    bitmap?.close();
  }
};
