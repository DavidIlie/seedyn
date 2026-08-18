import {
  FFMPEG_CORE_URL,
  FFMPEG_WASM_URL,
  GIF_DEFAULT_CLIP_SECONDS,
  GIF_FRAME_RATE,
  GIF_MAX_EDGE,
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
  clipSeconds?: number;
  signal: AbortSignal;
  onPhase: (phase: VideoGifPhase) => void;
}): Promise<Blob> {
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const ffmpeg = new FFmpeg();

  const onAbort = () => ffmpeg.terminate();
  input.signal.addEventListener("abort", onAbort, { once: true });

  const inputName = `source.${input.extension.replace(/[^a-z0-9]/gi, "") || "bin"}`;
  const clip = Math.max(1, input.clipSeconds ?? GIF_DEFAULT_CLIP_SECONDS);
  // `scale=w:-1` can produce an odd height; GIF tolerates it, and forcing the
  // longest edge keeps portrait clips from being upscaled.
  const filters = `fps=${GIF_FRAME_RATE},scale='min(${GIF_MAX_EDGE},iw)':'min(${GIF_MAX_EDGE},ih)':force_original_aspect_ratio=decrease:flags=lanczos`;

  try {
    input.onPhase({ phase: "loading" });
    await ffmpeg.load({ coreURL: FFMPEG_CORE_URL, wasmURL: FFMPEG_WASM_URL });
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
      "-t",
      String(clip),
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
      "-t",
      String(clip),
      "-i",
      inputName,
      "-i",
      "palette.png",
      "-lavfi",
      `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3`,
      "-loop",
      "0",
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
