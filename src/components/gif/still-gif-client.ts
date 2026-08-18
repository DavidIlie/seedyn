import type { StillRequest, StillResponse } from "./still-gif.worker";

/**
 * Owns one still-image worker for exactly one conversion.
 *
 * The worker is terminated on success, failure, and cancellation alike — a
 * worker that outlives its result keeps a decoded frame and a palette alive for
 * the rest of the session.
 */
export function encodeStillGif(input: {
  bytes: ArrayBuffer;
  contentType: string;
  signal: AbortSignal;
}): Promise<{ blob: Blob; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (input.signal.aborted) {
      reject(new Error("Conversion cancelled."));
      return;
    }

    const worker = new Worker(
      new URL("./still-gif.worker.ts", import.meta.url),
      { type: "module" },
    );

    const stop = () => {
      worker.terminate();
      input.signal.removeEventListener("abort", onAbort);
    };

    function onAbort() {
      stop();
      reject(new Error("Conversion cancelled."));
    }

    input.signal.addEventListener("abort", onAbort, { once: true });

    worker.addEventListener("message", (event: MessageEvent<StillResponse>) => {
      const result = event.data;
      stop();
      if (!result.ok) {
        reject(new Error(result.message));
        return;
      }
      resolve({
        blob: new Blob([result.bytes], { type: "image/gif" }),
        width: result.width,
        height: result.height,
      });
    });

    worker.addEventListener("error", (event) => {
      stop();
      reject(new Error(event.message || "The GIF encoder failed to start."));
    });

    const request: StillRequest = {
      bytes: input.bytes,
      contentType: input.contentType,
    };
    worker.postMessage(request, [request.bytes]);
  });
}
