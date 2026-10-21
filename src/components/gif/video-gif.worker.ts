/// <reference lib="webworker" />

import { applyPalette, GIFEncoder, quantize } from "gifenc";
import {
  BufferSource,
  CanvasSink,
  Input,
  MATROSKA,
  MP4,
  QTFF,
  UnsupportedInputFormatError,
  WEBM,
  type InputVideoTrack,
  type VideoCodec,
} from "mediabunny";

import {
  GIF_MAX_FRAMES,
  gifFrameCount,
  type VideoGifSettings,
} from "./options";

/**
 * Video → GIF off the main thread. mediabunny demuxes the MP4/MOV/WebM upload
 * and decodes it with the browser's own WebCodecs; `gifenc` writes the GIF.
 *
 * The output matches what the ffmpeg pipeline produced: frames sampled at the
 * chosen fps after speed is applied, scaled to fit the max edge without
 * upscaling, and a two-pass palette — one 256-colour global palette built from
 * the clip (weighted to moving pixels, like `palettegen=stats_mode=diff`), then
 * applied with 8×8 Bayer dithering (`paletteuse=dither=bayer:bayer_scale=3`).
 * The clip is decoded twice rather than held in memory between passes.
 */

export type VideoRequest = {
  bytes: ArrayBuffer;
  settings: VideoGifSettings;
};

export type VideoResponse =
  | { type: "progress"; step: "palette" | "encode"; ratio: number }
  | { type: "done"; bytes: ArrayBuffer }
  | { type: "error"; message: string; unsupported: boolean };

/** Caps the palette sample at ~6 MB of RGBA whatever the clip size. */
const PALETTE_SAMPLE_PIXELS = 1_500_000;

const CODEC_NAMES: Record<VideoCodec, string> = {
  avc: "H.264",
  hevc: "HEVC (H.265)",
  vp8: "VP8",
  vp9: "VP9",
  av1: "AV1",
  prores: "ProRes",
};

class UnsupportedVideo extends Error {}

/** ffmpeg's `dither_value`, so the 8×8 matrix matches `paletteuse`. */
function ditherValue(p: number): number {
  const q = p ^ (p >> 3);
  return (
    ((p & 4) >> 2) |
    ((q & 4) >> 1) |
    ((p & 2) << 1) |
    ((q & 2) << 2) |
    ((p & 1) << 4) |
    ((q & 1) << 5)
  );
}

// bayer_scale=3: offsets from -2 to +5 added to each channel before mapping.
const BAYER = Int8Array.from(
  { length: 64 },
  (_, i) => (ditherValue(i) >> 3) - 2,
);

function dither(data: Uint8ClampedArray, width: number, height: number): void {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const delta = BAYER[((y & 7) << 3) | (x & 7)] ?? 0;
      const offset = (y * width + x) * 4;
      // Uint8ClampedArray clamps the sums to 0–255.
      data[offset] = (data[offset] ?? 0) + delta;
      data[offset + 1] = (data[offset + 1] ?? 0) + delta;
      data[offset + 2] = (data[offset + 2] ?? 0) + delta;
    }
  }
}

async function openTrack(bytes: ArrayBuffer): Promise<InputVideoTrack> {
  if (typeof VideoDecoder === "undefined") {
    throw new UnsupportedVideo(
      "This browser cannot decode video, so it cannot make a GIF here. The original stays available; a current Chrome, Edge, Safari, or Firefox can convert it.",
    );
  }
  const input = new Input({
    source: new BufferSource(bytes),
    formats: [MP4, QTFF, WEBM, MATROSKA],
  });
  let track: InputVideoTrack | null;
  try {
    track = await input.getPrimaryVideoTrack();
  } catch (error) {
    if (error instanceof UnsupportedInputFormatError) {
      throw new UnsupportedVideo(
        "This video's container cannot be read in the browser, so it cannot become a GIF. The original stays available.",
      );
    }
    throw error;
  }
  if (!track) {
    throw new UnsupportedVideo(
      "This file has no video track to turn into a GIF.",
    );
  }
  if (!(await track.canDecode())) {
    const codec = await track.getCodec();
    throw new UnsupportedVideo(
      `This browser cannot decode ${codec ? CODEC_NAMES[codec] : "this video's codec"} video, so it cannot make a GIF from it. The original stays available.`,
    );
  }
  return track;
}

async function encode(
  request: VideoRequest,
  progress: (step: "palette" | "encode", ratio: number) => void,
): Promise<ArrayBuffer> {
  const { settings } = request;
  const track = await openTrack(request.bytes);

  // Display size is after rotation and pixel aspect ratio, as the <video>
  // preview shows it. Fit inside maxEdge × maxEdge, never upscale.
  const sourceWidth = await track.getDisplayWidth();
  const sourceHeight = await track.getDisplayHeight();
  const scale = Math.min(
    1,
    settings.maxEdge / sourceWidth,
    settings.maxEdge / sourceHeight,
  );
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  // The editor's times are on the <video> timeline, which starts at the first
  // presented frame. Speed applies before fps sampling, so the frame budget
  // holds at any speed; the server refuses more than GIF_MAX_FRAMES.
  const origin = Math.max(0, await track.getFirstTimestamp());
  const frames = Math.min(gifFrameCount(settings), GIF_MAX_FRAMES);
  if (frames < 1)
    throw new Error("The selected range is too short to make a GIF.");
  const timestamps = Array.from(
    { length: frames },
    (_, i) =>
      origin +
      Math.max(0, settings.start) +
      (i / settings.fps) * settings.speed,
  );

  // poolSize 1 reuses one canvas; each frame is read before the next is drawn.
  const sink = new CanvasSink(track, {
    width,
    height,
    fit: "fill",
    poolSize: 1,
  });
  // In a worker the sink always draws to OffscreenCanvas.
  const readFrame = (
    canvas: HTMLCanvasElement | OffscreenCanvas,
  ): ImageData => {
    const context =
      canvas instanceof OffscreenCanvas ? canvas.getContext("2d") : null;
    if (!context) throw new Error("This browser refused a 2D canvas context.");
    return context.getImageData(0, 0, width, height);
  };

  // Pass 1: palette. The first frame counts in full, later frames only where
  // a pixel changed, sampled down to a bounded buffer.
  const stride = Math.max(
    1,
    Math.ceil((width * height * frames) / PALETTE_SAMPLE_PIXELS),
  );
  const sample = new Uint8Array(PALETTE_SAMPLE_PIXELS * 4);
  let sampled = 0;
  let seen = 0;
  let previous: Uint8ClampedArray | null = null;
  let index = 0;
  for await (const wrapped of sink.canvasesAtTimestamps(timestamps)) {
    index += 1;
    if (!wrapped) continue;
    const { data } = readFrame(wrapped.canvas);
    for (let offset = 0; offset < data.length; offset += 4) {
      const changed =
        !previous ||
        data[offset] !== previous[offset] ||
        data[offset + 1] !== previous[offset + 1] ||
        data[offset + 2] !== previous[offset + 2];
      if (!changed) continue;
      if (seen++ % stride !== 0 || sampled === PALETTE_SAMPLE_PIXELS) continue;
      sample[sampled * 4] = data[offset] ?? 0;
      sample[sampled * 4 + 1] = data[offset + 1] ?? 0;
      sample[sampled * 4 + 2] = data[offset + 2] ?? 0;
      sample[sampled * 4 + 3] = 255;
      sampled += 1;
    }
    previous = data;
    progress("palette", index / frames);
  }
  if (sampled === 0) {
    throw new Error("No frames could be decoded from the selected range.");
  }
  // gifenc reads the whole underlying buffer, so hand it an exact-size copy.
  const palette = quantize(sample.slice(0, sampled * 4), 256, {
    format: "rgb565",
  });

  // Pass 2: decode again, dither, map to the palette, and write each frame.
  // Delays alternate whole centiseconds so playback keeps the exact fps.
  const encoder = GIFEncoder();
  let written = 0;
  index = 0;
  for await (const wrapped of sink.canvasesAtTimestamps(timestamps)) {
    index += 1;
    if (!wrapped) continue;
    const { data } = readFrame(wrapped.canvas);
    dither(data, width, height);
    const delayCentiseconds =
      Math.round((written + 1) * (100 / settings.fps)) -
      Math.round(written * (100 / settings.fps));
    encoder.writeFrame(applyPalette(data, palette, "rgb565"), width, height, {
      palette: written === 0 ? palette : undefined,
      delay: delayCentiseconds * 10,
      // 0 loops forever; -1 writes no loop extension, so it plays once.
      repeat: settings.loop ? 0 : -1,
    });
    written += 1;
    progress("encode", index / frames);
  }
  encoder.finish();

  const bytes = encoder.bytes();
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

self.onmessage = async (event: MessageEvent<VideoRequest>) => {
  const scope = self as unknown as DedicatedWorkerGlobalScope;
  try {
    const bytes = await encode(event.data, (step, ratio) => {
      const message: VideoResponse = { type: "progress", step, ratio };
      scope.postMessage(message);
    });
    const message: VideoResponse = { type: "done", bytes };
    scope.postMessage(message, [bytes]);
  } catch (error) {
    const message: VideoResponse = {
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "The video could not be converted in this browser.",
      unsupported: error instanceof UnsupportedVideo,
    };
    scope.postMessage(message);
  }
};
