import type { VideoGifSettings } from "./options";
import type { VideoRequest, VideoResponse } from "./video-gif.worker";

/**
 * Video → GIF in a worker, created only after explicit user intent.
 *
 * The worker decodes with the browser's own WebCodecs, so there is no codec
 * bundle to download and nothing third-party inside the CSP. What a browser
 * cannot decode is reported as `UnsupportedVideoError`, which the panel shows
 * as "cannot convert" rather than a failure worth retrying.
 */

export type VideoGifPhase =
  | { phase: "loading" }
  | { phase: "converting"; step: "palette" | "encode"; ratio: number | null };

/** This browser cannot read the container or decode the codec. */
export class UnsupportedVideoError extends Error {}

export function encodeVideoGif(input: {
  bytes: ArrayBuffer;
  settings: VideoGifSettings;
  signal: AbortSignal;
  onPhase: (phase: VideoGifPhase) => void;
}): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (input.signal.aborted) {
      reject(new Error("Conversion cancelled."));
      return;
    }

    input.onPhase({ phase: "loading" });
    const worker = new Worker(
      new URL("./video-gif.worker.ts", import.meta.url),
      {
        type: "module",
      },
    );

    // Terminating releases the decoder and every frame the worker still holds.
    const stop = () => {
      worker.terminate();
      input.signal.removeEventListener("abort", onAbort);
    };

    function onAbort() {
      stop();
      reject(new Error("Conversion cancelled."));
    }

    input.signal.addEventListener("abort", onAbort, { once: true });

    worker.addEventListener("message", (event: MessageEvent<VideoResponse>) => {
      const result = event.data;
      if (result.type === "progress") {
        input.onPhase({
          phase: "converting",
          step: result.step,
          ratio: result.ratio,
        });
        return;
      }
      stop();
      if (result.type === "error") {
        reject(
          result.unsupported
            ? new UnsupportedVideoError(result.message)
            : new Error(result.message),
        );
        return;
      }
      if (result.bytes.byteLength === 0) {
        reject(new Error("The converter produced an empty file."));
        return;
      }
      resolve(new Blob([result.bytes], { type: "image/gif" }));
    });

    worker.addEventListener("error", (event) => {
      stop();
      reject(new Error(event.message || "The GIF converter failed to start."));
    });

    const request: VideoRequest = {
      bytes: input.bytes,
      settings: input.settings,
    };
    worker.postMessage(request, [request.bytes]);
  });
}
