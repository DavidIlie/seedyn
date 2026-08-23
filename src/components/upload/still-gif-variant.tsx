"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { GIF_MAX_OUTPUT_BYTES } from "~/components/gif/options";
import { formatBytes } from "~/components/lib/format";
import { Button } from "~/components/ui/button";
import { CopyButton } from "~/components/ui/copy-button";

import { browserGifEndpoint } from "./endpoints";
import { TransferProgress } from "./transfer-progress";
import {
  postMultipart,
  TransportError,
  type UploadedRecord,
} from "./transport";

/**
 * One still image, one GIF URL, no detour to the detail page.
 *
 * The encode happens in this browser (`still-gif-client` is loaded on demand so
 * the encoder never ships to anyone who does not press the button), and the
 * result is stored as a variant of the upload that was just made.
 */

type Stage =
  | { name: "idle" }
  | { name: "converting" }
  | { name: "uploading"; blob: Blob; loaded: number; total: number | null }
  | { name: "stored"; url: string }
  | { name: "failed"; message: string; blob: Blob | null };

export function StillGifVariant({
  uploadId,
  file,
  record,
  onBusyChange,
}: {
  uploadId: string;
  file: File;
  record: UploadedRecord;
  onBusyChange: (busy: boolean) => void;
}) {
  const router = useRouter();
  const controller = useRef<AbortController | null>(null);
  const [stage, setStage] = useState<Stage>({ name: "idle" });

  useEffect(() => {
    return () => {
      const active = controller.current;
      controller.current = null;
      active?.abort();
      onBusyChange(false);
    };
  }, [onBusyChange]);

  function cancel() {
    const active = controller.current;
    controller.current = null;
    active?.abort();
    onBusyChange(false);
    setStage({ name: "idle" });
  }

  async function createGif(retainedBlob?: Blob) {
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    const owns = () => controller.current === abort;
    const setOwnedStage = (next: Stage) => {
      if (owns()) setStage(next);
    };
    onBusyChange(true);

    let blob = retainedBlob ?? null;
    try {
      if (!blob) {
        setOwnedStage({ name: "converting" });
        const bytes = await file.arrayBuffer();
        if (abort.signal.aborted || !owns()) return;
        const { encodeStillGif } = await import(
          "~/components/gif/still-gif-client"
        );
        const result = await encodeStillGif({
          bytes,
          contentType: record.contentType || file.type,
          signal: abort.signal,
        });
        blob = result.blob;
      }

      if (abort.signal.aborted || !owns()) return;
      if (blob.size > GIF_MAX_OUTPUT_BYTES) {
        setOwnedStage({
          name: "failed",
          message: `The GIF is ${formatBytes(blob.size)}, over the ${formatBytes(GIF_MAX_OUTPUT_BYTES)} limit.`,
          blob: null,
        });
        return;
      }

      const encoded = blob;
      setOwnedStage({
        name: "uploading",
        blob: encoded,
        loaded: 0,
        total: encoded.size,
      });
      const gif = await postMultipart({
        endpoint: browserGifEndpoint(uploadId),
        body: encoded,
        filename: "variant.gif",
        signal: abort.signal,
        onProgress: (loaded, total) =>
          setOwnedStage({ name: "uploading", blob: encoded, loaded, total }),
      });
      if (abort.signal.aborted || !owns()) return;
      setOwnedStage({ name: "stored", url: gif.url });
      router.refresh();
    } catch (error) {
      if (abort.signal.aborted || !owns()) return;
      const failure =
        error instanceof TransportError
          ? error
          : new TransportError(
              "conversion_failed",
              error instanceof Error
                ? error.message
                : "The GIF could not be created in this browser.",
            );
      setOwnedStage({ name: "failed", message: failure.message, blob });
    } finally {
      if (owns()) {
        controller.current = null;
        onBusyChange(false);
      }
    }
  }

  return (
    <div className="border-border rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">GIF URL</p>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Some places only embed GIFs. Make one from this image.
          </p>
        </div>
        {stage.name === "idle" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void createGif()}
          >
            Create GIF URL
          </Button>
        ) : null}
      </div>

      {stage.name === "converting" ? (
        <div className="mt-4">
          <p role="status" className="text-muted-foreground text-sm">
            Encoding one GIF frame in your browser…
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={cancel}
            className="mt-3"
          >
            Cancel
          </Button>
        </div>
      ) : null}

      {stage.name === "uploading" ? (
        <div className="mt-4 space-y-3">
          <TransferProgress
            loaded={stage.loaded}
            total={stage.total}
            caption="Storing the GIF —"
          />
          <Button type="button" variant="outline" size="sm" onClick={cancel}>
            Cancel
          </Button>
        </div>
      ) : null}

      {stage.name === "stored" ? (
        <div className="bg-sunken mt-3 flex items-center gap-3 rounded-lg p-3">
          <p className="min-w-0 flex-1 font-mono text-xs break-all">
            {stage.url}
          </p>
          <CopyButton value={stage.url} label="Copy the GIF URL" />
        </div>
      ) : null}

      {stage.name === "failed" ? (
        <div className="mt-3">
          <p role="alert" className="text-danger text-sm">
            {stage.message}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void createGif(stage.blob ?? undefined)}
            className="mt-3"
          >
            Retry GIF
          </Button>
        </div>
      ) : null}
    </div>
  );
}
