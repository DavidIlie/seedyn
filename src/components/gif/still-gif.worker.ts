/// <reference lib="webworker" />

import { applyPalette, GIFEncoder, quantize } from "gifenc";

import { GIF_STILL_MAX_HEIGHT, GIF_STILL_MAX_WIDTH } from "./options";

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
  const ratio = Math.min(
    1,
    GIF_STILL_MAX_WIDTH / width,
    GIF_STILL_MAX_HEIGHT / height,
  );
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function exactPalette(frame: ImageData): {
  palette: number[][];
  indexed: Uint8Array;
  transparentIndex: number;
} | null {
  const palette: number[][] = [];
  const indexes = new Map<number, number>();
  const indexed = new Uint8Array(frame.width * frame.height);
  let transparentIndex = -1;

  for (let pixel = 0; pixel < indexed.length; pixel += 1) {
    const offset = pixel * 4;
    const alpha = frame.data[offset + 3] ?? 255;
    const transparent = alpha <= 127;
    const red = transparent ? 0 : (frame.data[offset] ?? 0);
    const green = transparent ? 0 : (frame.data[offset + 1] ?? 0);
    const blue = transparent ? 0 : (frame.data[offset + 2] ?? 0);
    const normalizedAlpha = transparent ? 0 : 255;
    const key =
      ((red << 24) | (green << 16) | (blue << 8) | normalizedAlpha) >>> 0;
    let index = indexes.get(key);
    if (index === undefined) {
      if (palette.length === 256) return null;
      index = palette.length;
      indexes.set(key, index);
      palette.push([red, green, blue, normalizedAlpha]);
      if (transparent) transparentIndex = index;
    }
    indexed[pixel] = index;
  }

  return { palette, indexed, transparentIndex };
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

    const exact = exactPalette(frame);
    const hasTransparency = frame.data.some(
      (channel, index) => index % 4 === 3 && channel <= 127,
    );
    // Indexed PNGs, logos, and flat screenshots can fit GIF's palette exactly.
    // Opaque images use rgb565 instead of the old 4-bit/channel rgba path.
    const format = hasTransparency ? "rgba4444" : "rgb565";
    const palette =
      exact?.palette ??
      quantize(frame.data, 256, {
        format,
        oneBitAlpha: hasTransparency,
      });
    const indexed = exact?.indexed ?? applyPalette(frame.data, palette, format);
    const transparentIndex =
      exact?.transparentIndex ?? palette.findIndex((color) => color[3] === 0);

    const encoder = GIFEncoder();
    encoder.writeFrame(indexed, size.width, size.height, {
      palette,
      transparent: transparentIndex >= 0,
      transparentIndex: Math.max(0, transparentIndex),
      repeat: -1,
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
