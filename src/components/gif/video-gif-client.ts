import {
  FFMPEG_CORE_URL,
  FFMPEG_WASM_URL,
  FFMPEG_WORKER_URL,
  GIF_MAX_FRAMES,
  type VideoGifSettings,
} from "./options";

/**
 * Video → GIF through `ffmpeg.wasm`, loaded only after explicit user intent.
 *
 * Two properties matter more than the conversion itself:
 *
 *   - the module is behind a dynamic `import()`, so no route bundle contains
 *     the codec and no dashboard visit downloads it;
 *   - `coreURL`/`wasmURL` point at Seedyn's own origin. The library's defaults
 *     are unpkg URLs, which would put a third-party CDN inside the CSP and make
 *     a core-version change someone else's decision.
 *
 * The single-threaded core is deliberate: the multi-threaded one needs
 * `SharedArrayBuffer` and therefore cross-origin isolation across the whole app.
 */

export type VideoGifPhase =
  | { phase: "loading" }
  | { phase: "converting"; step: "palette" | "encode"; ratio: number | null };

export async function encodeVideoGif(input: {
  bytes: ArrayBuffer;
  extension: string;
  settings: VideoGifSettings;
  signal: AbortSignal;
  onPhase: (phase: VideoGifPhase) => void;
}): Promise<Blob> {
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const ffmpeg = new FFmpeg();

  const onAbort = () => ffmpeg.terminate();
  input.signal.addEventListener("abort", onAbort, { once: true });

  const inputName = `source.${input.extension.replace(/[^a-z0-9]/gi, "") || "bin"}`;
  const { settings } = input;
  const start = Math.max(0, settings.start);
  const duration = Math.max(0.1, settings.end - start);
  // Input seeking (`-ss`/`-t` before `-i`) trims before decoding, so a late
  // start does not pay for every frame before it. `setpts` applies speed
  // before `fps` resamples, so the frame budget holds at any speed.
  const trim = ["-ss", start.toFixed(3), "-t", duration.toFixed(3)];
  const edge = settings.maxEdge;
  const filters = `setpts=PTS/${settings.speed},fps=${settings.fps},scale='min(${edge},iw)':'min(${edge},ih)':force_original_aspect_ratio=decrease:flags=lanczos`;

  try {
    input.onPhase({ phase: "loading" });
    await ffmpeg.load({
      classWorkerURL: new URL(FFMPEG_WORKER_URL, location.origin).href,
      coreURL: new URL(FFMPEG_CORE_URL, location.origin).href,
      wasmURL: new URL(FFMPEG_WASM_URL, location.origin).href,
    });
    if (input.signal.aborted) throw new Error("Conversion cancelled.");

    let step: "palette" | "encode" = "palette";
    ffmpeg.on("progress", ({ progress }) => {
      const ratio =
        typeof progress === "number" && Number.isFinite(progress)
          ? Math.min(1, Math.max(0, progress))
          : null;
      input.onPhase({ phase: "converting", step, ratio });
    });

    await ffmpeg.writeFile(inputName, new Uint8Array(input.bytes));

    // Two-pass palette. A direct GIF encode quantises to the default 256-colour
    // web palette and bands badly on real video.
    input.onPhase({ phase: "converting", step: "palette", ratio: null });
    await ffmpeg.exec([
      ...trim,
      "-i",
      inputName,
      "-vf",
      `${filters},palettegen=stats_mode=diff`,
      "palette.png",
    ]);
    if (input.signal.aborted) throw new Error("Conversion cancelled.");

    step = "encode";
    input.onPhase({ phase: "converting", step: "encode", ratio: null });
    await ffmpeg.exec([
      ...trim,
      "-i",
      inputName,
      "-i",
      "palette.png",
      "-lavfi",
      `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3`,
      // The server refuses more; rounding at the clip edge must not tip over.
      "-frames:v",
      String(GIF_MAX_FRAMES),
      // 0 loops forever; -1 writes no loop extension, so it plays once.
      "-loop",
      settings.loop ? "0" : "-1",
      "output.gif",
    ]);
    if (input.signal.aborted) throw new Error("Conversion cancelled.");

    const data = await ffmpeg.readFile("output.gif");
    if (typeof data === "string") {
      throw new Error("The converter returned text instead of GIF bytes.");
    }
    const bytes = Uint8Array.from(data);
    if (bytes.byteLength === 0) {
      throw new Error(
        "The converter produced an empty file. This build may not support that codec.",
      );
    }
    return new Blob([bytes.buffer], { type: "image/gif" });
  } finally {
    input.signal.removeEventListener("abort", onAbort);
    // Releases the wasm heap and the worker. Without this the 31 MB core stays
    // resident for the rest of the page's life.
    ffmpeg.terminate();
  }
}
