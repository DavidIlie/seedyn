"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { formatBytes } from "~/components/lib/format";

import { startDirectUpload, type DirectTransfer } from "./direct-transport";
import { BROWSER_UPLOAD_ENDPOINT } from "./endpoints";
import { likelyByteCap, usesDirectUpload } from "./limits";
import {
  postMultipart,
  TransportError,
  type UploadedRecord,
} from "./transport";
import { fetchUrlBytes, parseHttpsUrl } from "./url-ingest";

/**
 * The one transfer state machine.
 *
 * There is exactly one in-flight operation at a time and it owns its
 * `AbortController`, so a cancelled transfer can never resurrect itself by
 * resolving late into state that has moved on. Progress is measured — the
 * `XMLHttpRequest` in `transport.ts` reports bytes actually handed to the
 * socket — and an indeterminate transfer says so rather than inventing a
 * percentage.
 *
 * Which transport carries the bytes is not a question the person uploading is
 * asked. A file above the single-request ceiling becomes a resumable multipart
 * session that survives a pause and a dropped connection; everything else is
 * one POST. Both end on the same result step with the same record.
 */

export type TransferPhase =
  | { name: "idle" }
  | { name: "fetching"; label: string; loaded: number; total: number | null }
  /** Hashing a large file on this device before a session exists. */
  | { name: "preparing"; label: string }
  | { name: "uploading"; label: string; loaded: number; total: number | null }
  | { name: "paused"; label: string; loaded: number; total: number }
  | { name: "offline"; label: string; loaded: number; total: number }
  /** Every byte is in storage and the server is checking them. */
  | { name: "verifying"; label: string; loaded: number; total: number }
  | { name: "done"; record: UploadedRecord; label: string; file: File };

const TRANSFER_PHASES = [
  "fetching",
  "preparing",
  "uploading",
  "paused",
  "offline",
  "verifying",
] as const;

export function isTransferPhase(phase: TransferPhase): boolean {
  return (TRANSFER_PHASES as readonly string[]).includes(phase.name);
}

export type UploadTransfer = ReturnType<typeof useUploadTransfer>;

export function useUploadTransfer(directUploadMaxBytes: number) {
  const router = useRouter();
  const controller = useRef<AbortController | null>(null);
  const directTransfer = useRef<DirectTransfer | null>(null);
  const [phase, setPhase] = useState<TransferPhase>({ name: "idle" });
  const [failure, setFailure] = useState<string | null>(null);
  /** Only a multipart session can be held and picked up again. */
  const [pausable, setPausable] = useState(false);

  const transferring = isTransferPhase(phase);

  useEffect(() => {
    return () => {
      const active = controller.current;
      controller.current = null;
      directTransfer.current = null;
      active?.abort();
    };
  }, []);

  /**
   * Send a file. The browser never chooses a slug, a media domain, or an HTML
   * rendering mode up front: `renderHtml: "auto"` lets the server render a
   * saved page as a page and treat everything else as itself, and both link
   * settings are changed afterwards on the result step.
   */
  const start = useCallback(
    async (file: File, sourceLabel: string) => {
      if (controller.current) return;
      const cap = likelyByteCap(file, directUploadMaxBytes);
      if (file.size > cap) {
        setFailure(
          `${sourceLabel} is ${formatBytes(file.size)}. The limit for this file type is ${formatBytes(cap)}.`,
        );
        return;
      }
      const direct = usesDirectUpload(file);

      const abort = new AbortController();
      controller.current = abort;
      const owns = () => controller.current === abort;
      const setOwnedPhase = (next: TransferPhase) => {
        if (owns()) setPhase(next);
      };

      setFailure(null);
      setOwnedPhase(
        direct
          ? { name: "preparing", label: sourceLabel }
          : {
              name: "uploading",
              label: sourceLabel,
              loaded: 0,
              total: file.size,
            },
      );

      try {
        let record: UploadedRecord;
        if (direct) {
          const transfer = startDirectUpload({
            file,
            signal: abort.signal,
            onState: (state) =>
              setOwnedPhase(
                state.name === "preparing"
                  ? { name: "preparing", label: sourceLabel }
                  : { ...state, label: sourceLabel },
              ),
          });
          directTransfer.current = transfer;
          setPausable(true);
          record = await transfer.completion;
        } else {
          record = await postMultipart({
            endpoint: BROWSER_UPLOAD_ENDPOINT,
            body: file,
            filename: file.name || "upload",
            fields: { renderHtml: "auto" },
            signal: abort.signal,
            onProgress: (loaded, total) =>
              setOwnedPhase({
                name: "uploading",
                label: sourceLabel,
                loaded,
                total,
              }),
          });
        }
        if (!owns() || abort.signal.aborted) return;
        setOwnedPhase({ name: "done", record, label: sourceLabel, file });
        // Server-rendered lists are the source of truth; nothing is inserted
        // optimistically.
        router.refresh();
      } catch (error) {
        if (!owns()) return;
        const transportFailure =
          error instanceof TransportError
            ? error
            : new TransportError("unknown", "The upload failed.");
        setPhase({ name: "idle" });
        setFailure(
          transportFailure.code === "cancelled"
            ? null
            : transportFailure.message,
        );
      } finally {
        if (owns()) {
          controller.current = null;
          directTransfer.current = null;
          setPausable(false);
        }
      }
    },
    [directUploadMaxBytes, router],
  );

  /**
   * Fetch an HTTPS URL in this browser and upload the bytes. Deliberately
   * client-side: the server never makes the outbound request, so there is no
   * SSRF surface to defend.
   */
  const ingestUrl = useCallback(
    async (value: string) => {
      if (controller.current) return;
      const abort = new AbortController();
      controller.current = abort;
      const owns = () => controller.current === abort;
      const setOwnedPhase = (next: TransferPhase) => {
        if (owns()) setPhase(next);
      };
      setFailure(null);
      try {
        const url = parseHttpsUrl(value);
        setOwnedPhase({
          name: "fetching",
          label: url.href,
          loaded: 0,
          total: null,
        });
        const file = await fetchUrlBytes({
          url,
          signal: abort.signal,
          onProgress: (loaded, total) =>
            setOwnedPhase({ name: "fetching", label: url.href, loaded, total }),
        });
        if (!owns() || abort.signal.aborted) return;
        controller.current = null;
        await start(file, file.name);
      } catch (error) {
        if (!owns()) return;
        controller.current = null;
        const transportFailure =
          error instanceof TransportError
            ? error
            : new TransportError("unknown", "That URL could not be fetched.");
        setPhase({ name: "idle" });
        setFailure(
          transportFailure.code === "cancelled"
            ? null
            : transportFailure.message,
        );
      }
    },
    [start],
  );

  const cancel = useCallback(() => {
    const active = controller.current;
    controller.current = null;
    directTransfer.current = null;
    setPausable(false);
    active?.abort();
    setPhase({ name: "idle" });
  }, []);

  const reset = useCallback(() => {
    const active = controller.current;
    controller.current = null;
    directTransfer.current = null;
    setPausable(false);
    active?.abort();
    setPhase({ name: "idle" });
    setFailure(null);
  }, []);

  /**
   * Hold a multipart session where it stands, or pick it up again. Completed
   * parts stay in storage either way, which is why this is a real pause rather
   * than a cancel with a friendlier label.
   */
  const pauseResume = useCallback(() => {
    directTransfer.current?.pauseResume();
  }, []);

  const isTransferring = useCallback(() => controller.current !== null, []);

  return {
    phase,
    failure,
    setFailure,
    transferring,
    pausable,
    pauseResume,
    start,
    ingestUrl,
    cancel,
    reset,
    isTransferring,
  };
}
