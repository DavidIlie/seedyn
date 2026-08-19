"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { formatBytes } from "~/components/lib/format";
import { CopyButton } from "~/components/ui/copy-button";
import { buttonPrimary, buttonQuiet } from "~/components/ui/styles";
import { browserGifEndpoint } from "~/components/upload/endpoints";
import { postMultipart, TransportError } from "~/components/upload/transport";

import { planGifConversion } from "./eligibility";
import {
  FFMPEG_APPROXIMATE_MB,
  GIF_DEFAULT_CLIP_SECONDS,
  GIF_MAX_OUTPUT_BYTES,
} from "./options";
import { encodeStillGif } from "./still-gif-client";
import { encodeVideoGif } from "./video-gif-client";

/**
 * The GIF panel. It is always rendered, and it always says what state this
 * upload is in — stored, convertible, or not eligible and why.
 *
 * Conversion runs entirely in the browser (decision D-010): there is no FFmpeg
 * server and no processing queue. The panel only uploads a GIF it has actually
 * produced, and it never reports a percentage it did not measure.
 */

type Stage =
  | { name: "idle" }
  | { name: "fetching"; loaded: number; total: number | null }
  | { name: "loading-engine" }
  | { name: "converting"; detail: string; ratio: number | null }
  | { name: "converted"; blob: Blob; previewUrl: string }
  | { name: "uploading"; loaded: number; total: number | null }
  | { name: "stored"; url: string }
  | { name: "failed"; message: string };

export function GifPanel({
  uploadId,
  uploadKind,
  contentType,
  extension,
  sourceUrl,
  storedGifUrl,
  storedGifBytes,
  passwordProtected,
}: {
  uploadId: string;
  uploadKind: string;
  contentType: string;
  extension: string;
  sourceUrl: string;
  storedGifUrl: string | null;
  storedGifBytes: string | null;
  passwordProtected?: boolean;
}) {
  const plan = planGifConversion({
    uploadKind,
    contentType,
    hasStoredGif: storedGifUrl !== null,
  });

  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ name: "idle" });
  const controller = useRef<AbortController | null>(null);
  const previewUrl = useRef<string | null>(null);

  const releasePreview = useCallback(() => {
    if (previewUrl.current) {
      URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
    }
  }, []);

  // Leaving the page mid-conversion must not leak the worker, the wasm heap, or
  // the object URL holding the candidate.
  useEffect(() => {
    return () => {
      const active = controller.current;
      controller.current = null;
      active?.abort();
      releasePreview();
    };
  }, [releasePreview]);

  function cancel() {
    const active = controller.current;
    controller.current = null;
    active?.abort();
    releasePreview();
    setStage({ name: "idle" });
  }

  function ownsOperation(abort: AbortController): boolean {
    return controller.current === abort;
  }

  function setOwnedStage(abort: AbortController, next: Stage): void {
    if (ownsOperation(abort)) setStage(next);
  }

  async function fetchSource(abort: AbortController): Promise<ArrayBuffer> {
    const { signal } = abort;
    setOwnedStage(abort, { name: "fetching", loaded: 0, total: null });
    const response = await fetch(sourceUrl, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "force-cache",
      signal,
    });
    if (!response.ok) {
      throw new Error(
        `The original could not be read (HTTP ${response.status}).`,
      );
    }
    const declared = Number(response.headers.get("content-length"));
    const total = Number.isFinite(declared) && declared > 0 ? declared : null;

    const body = response.body;
    if (!body) return response.arrayBuffer();

    const reader = body.getReader();
    const chunks: BlobPart[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      loaded += value.byteLength;
      chunks.push(value);
      setOwnedStage(abort, { name: "fetching", loaded, total });
    }
    return new Blob(chunks).arrayBuffer();
  }

  async function convert() {
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    releasePreview();

    try {
      const bytes = await fetchSource(abort);
      if (abort.signal.aborted || !ownsOperation(abort)) return;

      let blob: Blob;
      if (plan.engine === "still") {
        setOwnedStage(abort, {
          name: "converting",
          detail: "Encoding a single frame",
          ratio: null,
        });
        const result = await encodeStillGif({
          bytes,
          contentType,
          signal: abort.signal,
        });
        blob = result.blob;
      } else {
        blob = await encodeVideoGif({
          bytes,
          extension,
          signal: abort.signal,
          onPhase: (phase) => {
            if (phase.phase === "loading") {
              setOwnedStage(abort, { name: "loading-engine" });
              return;
            }
            setOwnedStage(abort, {
              name: "converting",
              detail:
                phase.step === "palette"
                  ? "Building a colour palette"
                  : "Encoding frames",
              ratio: phase.ratio,
            });
          },
        });
      }

      if (abort.signal.aborted || !ownsOperation(abort)) return;

      if (blob.size > GIF_MAX_OUTPUT_BYTES) {
        setOwnedStage(abort, {
          name: "failed",
          message: `The GIF came out at ${formatBytes(blob.size)}, over the ${formatBytes(GIF_MAX_OUTPUT_BYTES)} limit, so it was not uploaded. A shorter clip or smaller source will fit.`,
        });
        return;
      }

      const url = URL.createObjectURL(blob);
      previewUrl.current = url;
      setOwnedStage(abort, { name: "converted", blob, previewUrl: url });
    } catch (error) {
      if (abort.signal.aborted || !ownsOperation(abort)) return;
      setOwnedStage(abort, {
        name: "failed",
        message:
          error instanceof Error
            ? error.message
            : "The conversion failed in this browser.",
      });
    } finally {
      if (ownsOperation(abort)) controller.current = null;
    }
  }

  async function upload(blob: Blob) {
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    setOwnedStage(abort, {
      name: "uploading",
      loaded: 0,
      total: blob.size,
    });
    try {
      const record = await postMultipart({
        endpoint: browserGifEndpoint(uploadId),
        body: blob,
        filename: "variant.gif",
        signal: abort.signal,
        onProgress: (loaded, total) =>
          setOwnedStage(abort, { name: "uploading", loaded, total }),
      });
      if (abort.signal.aborted || !ownsOperation(abort)) return;
      releasePreview();
      setOwnedStage(abort, { name: "stored", url: record.url });
      // The server row is authoritative; re-read it so a reload, a back
      // navigation, and the library row all agree.
      router.refresh();
    } catch (error) {
      if (abort.signal.aborted || !ownsOperation(abort)) return;
      const failure =
        error instanceof TransportError
          ? error
          : new TransportError("unknown", "The GIF could not be stored.");
      if (failure.code === "cancelled") {
        // The candidate is still in memory, so Retry is a real option.
        const retainedPreview = previewUrl.current ?? URL.createObjectURL(blob);
        previewUrl.current = retainedPreview;
        setOwnedStage(abort, {
          name: "converted",
          blob,
          previewUrl: retainedPreview,
        });
        return;
      }
      setOwnedStage(abort, {
        name: "failed",
        message: failure.message,
      });
    } finally {
      if (ownsOperation(abort)) controller.current = null;
    }
  }

  const settledUrl =
    stage.name === "stored"
      ? stage.url
      : plan.engine === "stored"
        ? storedGifUrl
        : null;

  return (
    <section
      aria-labelledby="gif-heading"
      className="border-border rounded-xl border"
    >
      <div className="border-border border-b px-4 py-3">
        <h2 id="gif-heading" className="text-sm font-medium">
          GIF
        </h2>
      </div>

      <div className="space-y-3 p-4">
        {settledUrl ? (
          <>
            <p className="font-mono text-sm break-all">{settledUrl}</p>
            <p className="text-muted-foreground text-sm">
              Stored as a permanent URL alongside the original. Copying it needs
              no converter.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton value={settledUrl} label="Copy the GIF URL" />
              <a href={settledUrl} download className={buttonQuiet}>
                Download GIF
              </a>
            </div>
            {storedGifBytes && stage.name !== "stored" ? (
              <p className="text-muted-foreground text-sm">
                {formatBytes(storedGifBytes)}
              </p>
            ) : null}
          </>
        ) : plan.engine === "already-gif" ? (
          <p className="text-muted-foreground text-sm">
            This upload is already a GIF. Its original URL ends in{" "}
            <code className="font-mono">.gif</code> and needs no variant.
          </p>
        ) : passwordProtected ? (
          <p className="text-muted-foreground text-sm">
            Browser conversion is paused while the original is password
            protected. Remove the password, create the GIF, then protect the
            upload again; the stored GIF inherits the same password.
          </p>
        ) : plan.engine === "none" ? (
          <p className="text-muted-foreground text-sm">{plan.reason}</p>
        ) : (
          <>
            {stage.name === "idle" || stage.name === "failed" ? (
              <>
                <p className="text-muted-foreground text-sm">
                  {plan.engine === "still"
                    ? "No stored GIF yet. Your browser keeps the original dimensions up to 1920×1080 and encodes one frame. Images with 256 colours or fewer remain exact; larger palettes use GIF’s highest-fidelity 256-colour approximation."
                    : `No stored GIF yet. Converting video needs a ${FFMPEG_APPROXIMATE_MB} MB converter, downloaded only when you ask for it. The first ${GIF_DEFAULT_CLIP_SECONDS} seconds are converted.`}
                </p>
                <button
                  type="button"
                  onClick={() => void convert()}
                  className={buttonPrimary}
                >
                  {plan.engine === "still"
                    ? "Convert to GIF"
                    : `Load converter and convert`}
                </button>
              </>
            ) : null}

            {stage.name === "fetching" ||
            stage.name === "loading-engine" ||
            stage.name === "converting" ||
            stage.name === "uploading" ? (
              <div className="space-y-3">
                <GifProgress stage={stage} />
                <button type="button" onClick={cancel} className={buttonQuiet}>
                  Cancel
                </button>
              </div>
            ) : null}

            {stage.name === "converted" ? (
              <div className="space-y-3">
                {/* oxlint-disable-next-line next/no-img-element -- local blob preview cannot use the Next image optimizer */}
                <img
                  src={stage.previewUrl}
                  alt="Preview of the GIF this browser produced"
                  className="border-border max-h-64 w-auto max-w-full rounded border object-contain"
                />
                <p className="text-muted-foreground text-sm">
                  {formatBytes(stage.blob.size)}. Nothing has been stored yet.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void upload(stage.blob)}
                    className={buttonPrimary}
                  >
                    Store this GIF
                  </button>
                  <button
                    type="button"
                    onClick={cancel}
                    className={buttonQuiet}
                  >
                    Discard
                  </button>
                </div>
              </div>
            ) : null}

            {stage.name === "failed" ? (
              <p
                role="alert"
                className="border-danger text-danger rounded-lg border p-3 text-sm"
              >
                {stage.message}
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function GifProgress({ stage }: { stage: Stage }) {
  const { caption, ratio } = describe(stage);
  const value = ratio === null ? null : Math.round(ratio * 100);

  return (
    <div>
      <div
        role="progressbar"
        aria-label={caption}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(value === null ? {} : { "aria-valuenow": value })}
        className="border-border bg-background h-2 w-full overflow-hidden rounded-full border"
      >
        {value === null ? null : (
          <div
            className="bg-accent h-full transition-[width] duration-[120ms]"
            style={{ width: `${value}%` }}
          />
        )}
      </div>
      <p
        role="status"
        aria-live="polite"
        className="text-muted-foreground mt-2 text-sm"
      >
        {caption}
        {value === null ? "" : ` — ${value}%`}
      </p>
    </div>
  );
}

function describe(stage: Stage): { caption: string; ratio: number | null } {
  switch (stage.name) {
    case "fetching":
      return {
        caption: `Reading the original — ${formatBytes(stage.loaded)}`,
        ratio: stage.total ? stage.loaded / stage.total : null,
      };
    case "loading-engine":
      // The library reports no download progress, so none is drawn.
      return {
        caption: `Loading the ${FFMPEG_APPROXIMATE_MB} MB converter`,
        ratio: null,
      };
    case "converting":
      return { caption: stage.detail, ratio: stage.ratio };
    case "uploading":
      return {
        caption: `Storing the GIF — ${formatBytes(stage.loaded)}`,
        ratio: stage.total ? stage.loaded / stage.total : null,
      };
    default:
      return { caption: "", ratio: null };
  }
}
