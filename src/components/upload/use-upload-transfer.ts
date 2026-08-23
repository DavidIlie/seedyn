"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { formatBytes } from "~/components/lib/format";

import { BROWSER_UPLOAD_ENDPOINT } from "./endpoints";
import { likelyByteCap } from "./limits";
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
 */

export type TransferPhase =
  | { name: "idle" }
  | { name: "fetching"; label: string; loaded: number; total: number | null }
  | { name: "uploading"; label: string; loaded: number; total: number | null }
  | { name: "done"; record: UploadedRecord; label: string; file: File };

export type UploadTransfer = ReturnType<typeof useUploadTransfer>;

export function useUploadTransfer() {
  const router = useRouter();
  const controller = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<TransferPhase>({ name: "idle" });
  const [failure, setFailure] = useState<string | null>(null);

  const transferring = phase.name === "uploading" || phase.name === "fetching";

  useEffect(() => {
    return () => {
      const active = controller.current;
      controller.current = null;
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
      const cap = likelyByteCap(file);
      if (file.size > cap) {
        setFailure(
          `${sourceLabel} is ${formatBytes(file.size)}. The limit for this file type is ${formatBytes(cap)}.`,
        );
        return;
      }

      const abort = new AbortController();
      controller.current = abort;
      const owns = () => controller.current === abort;
      const setOwnedPhase = (next: TransferPhase) => {
        if (owns()) setPhase(next);
      };

      setFailure(null);
      setOwnedPhase({
        name: "uploading",
        label: sourceLabel,
        loaded: 0,
        total: file.size,
      });

      try {
        const record = await postMultipart({
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
        if (owns()) controller.current = null;
      }
    },
    [router],
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
    active?.abort();
    setPhase({ name: "idle" });
  }, []);

  const reset = useCallback(() => {
    const active = controller.current;
    controller.current = null;
    active?.abort();
    setPhase({ name: "idle" });
    setFailure(null);
  }, []);

  const isTransferring = useCallback(() => controller.current !== null, []);

  return {
    phase,
    failure,
    setFailure,
    transferring,
    start,
    ingestUrl,
    cancel,
    reset,
    isTransferring,
  };
}
