"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { formatBytes } from "~/components/lib/format";
import { CopyButton } from "~/components/ui/copy-button";
import {
  buttonCompact,
  buttonPrimary,
  buttonQuiet,
  inputBase,
  labelBase,
} from "~/components/ui/styles";

import { BROWSER_UPLOAD_ENDPOINT } from "./endpoints";
import {
  postMultipart,
  TransportError,
  type UploadedRecord,
} from "./transport";
import {
  fetchUrlBytes,
  parseHttpsUrl,
  URL_INGEST_BYTE_CAP,
} from "./url-ingest";

/**
 * The browser upload island.
 *
 * It exists for capabilities a Server Action cannot provide: byte-level upload
 * progress, a real cancel, drag-and-drop, clipboard paste, and a same-browser
 * fetch of an HTTPS URL. Everything it reports is measured — there is no
 * synthetic progress and no optimistic row.
 *
 * The native `<dialog>` element carries the modal semantics: focus trap, focus
 * restore, and Escape are the browser's, not a re-implementation.
 */

type Phase =
  | { name: "idle" }
  | { name: "selected"; file: File }
  | { name: "fetching"; label: string; loaded: number; total: number | null }
  | { name: "uploading"; label: string; loaded: number; total: number | null }
  | { name: "done"; record: UploadedRecord; label: string }
  | { name: "failed"; code: string; message: string };

const MAX_UPLOAD_BYTES = URL_INGEST_BYTE_CAP;
const UploadDialogContext = createContext<(() => void) | null>(null);

function percent(loaded: number, total: number | null): number | null {
  if (total === null || total <= 0) return null;
  return Math.min(100, Math.round((loaded / total) * 100));
}

function Progress({
  loaded,
  total,
  caption,
}: {
  loaded: number;
  total: number | null;
  caption: string;
}) {
  const value = percent(loaded, total);
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
        {/* An indeterminate transfer draws no bar at all rather than an
            animation that implies progress nobody measured. */}
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
        {caption}{" "}
        {value === null
          ? `${formatBytes(loaded)} transferred`
          : `${value}% · ${formatBytes(loaded)} of ${formatBytes(total ?? 0)}`}
      </p>
    </div>
  );
}

export function UploadAction({
  className = "",
  label = "Upload",
}: {
  className?: string;
  label?: string;
}) {
  const openDialog = useContext(UploadDialogContext);
  if (!openDialog) {
    throw new Error("UploadAction must be rendered inside UploadProvider");
  }

  return (
    <button
      type="button"
      onClick={openDialog}
      className={`${buttonPrimary} ${className}`}
    >
      {label}
    </button>
  );
}

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const instanceId = useId();
  const dialogTitleId = `${instanceId}-upload-dialog-title`;
  const fileInputId = `${instanceId}-upload-file`;
  const urlInputId = `${instanceId}-upload-url`;
  const urlHintId = `${instanceId}-upload-url-hint`;
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [dragging, setDragging] = useState(false);
  const [urlValue, setUrlValue] = useState("");

  const busy = phase.name === "uploading" || phase.name === "fetching";

  const send = useCallback(
    async (file: File, sourceLabel: string) => {
      if (controller.current) return;
      if (file.size > MAX_UPLOAD_BYTES) {
        setPhase({
          name: "failed",
          code: "too_large",
          message: `${sourceLabel} is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`,
        });
        return;
      }

      const abort = new AbortController();
      controller.current = abort;
      const ownsOperation = () => controller.current === abort;
      const setOwnedPhase = (next: Phase) => {
        if (ownsOperation()) setPhase(next);
      };
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
          signal: abort.signal,
          onProgress: (loaded, total) =>
            setOwnedPhase({
              name: "uploading",
              label: sourceLabel,
              loaded,
              total,
            }),
        });
        if (!ownsOperation() || abort.signal.aborted) return;
        setOwnedPhase({ name: "done", record, label: sourceLabel });
        // Server-rendered lists are the source of truth; nothing is inserted
        // optimistically.
        router.refresh();
      } catch (error) {
        if (!ownsOperation()) return;
        const failure =
          error instanceof TransportError
            ? error
            : new TransportError("unknown", "The upload failed.");
        setOwnedPhase(
          failure.code === "cancelled"
            ? { name: "idle" }
            : { name: "failed", code: failure.code, message: failure.message },
        );
      } finally {
        if (ownsOperation()) controller.current = null;
      }
    },
    [router],
  );

  const chooseFile = useCallback((file: File) => {
    if (controller.current) return;
    setPhase({ name: "selected", file });
  }, []);

  useEffect(() => {
    return () => {
      const active = controller.current;
      controller.current = null;
      active?.abort();
    };
  }, []);

  // Paste is an enhancement layered on the open dialog; the file input below
  // remains the path that always works.
  useEffect(() => {
    if (!open) return undefined;
    const onPaste = (event: ClipboardEvent) => {
      if (controller.current) return;
      const data = event.clipboardData;
      if (!data) return;
      const file = data.files.item(0);
      if (file) {
        event.preventDefault();
        chooseFile(file);
        return;
      }
      const text = data.getData("text/plain").trim();
      if (text.startsWith("https://")) setUrlValue(text);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [open, chooseFile]);

  const openDialog = useCallback(() => {
    setPhase({ name: "idle" });
    setUrlValue("");
    setOpen(true);
    dialog.current?.showModal();
  }, []);

  function closeDialog() {
    if (busy) {
      const abandon = window.confirm(
        "An upload is still running. Cancel it and close?",
      );
      if (!abandon) return;
      const active = controller.current;
      controller.current = null;
      active?.abort();
    }
    setOpen(false);
    setPhase({ name: "idle" });
    dialog.current?.close();
  }

  async function ingestUrl(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    const ownsOperation = () => controller.current === abort;
    const setOwnedPhase = (next: Phase) => {
      if (ownsOperation()) setPhase(next);
    };
    try {
      const url = parseHttpsUrl(urlValue);
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
          setOwnedPhase({
            name: "fetching",
            label: url.href,
            loaded,
            total,
          }),
      });
      if (!ownsOperation() || abort.signal.aborted) return;
      controller.current = null;
      await send(file, file.name);
    } catch (error) {
      if (!ownsOperation()) return;
      controller.current = null;
      const failure =
        error instanceof TransportError
          ? error
          : new TransportError("unknown", "That URL could not be fetched.");
      setPhase(
        failure.code === "cancelled"
          ? { name: "idle" }
          : { name: "failed", code: failure.code, message: failure.message },
      );
    }
  }

  return (
    <UploadDialogContext.Provider value={openDialog}>
      {children}

      <dialog
        ref={dialog}
        aria-labelledby={dialogTitleId}
        onCancel={(event) => {
          // Escape must not discard a running upload without asking.
          event.preventDefault();
          closeDialog();
        }}
        onClose={() => setOpen(false)}
        className="border-border bg-panel text-foreground backdrop:bg-foreground/30 m-auto w-[min(34rem,calc(100vw-2rem))] rounded-md border p-0"
      >
        <div className="border-border flex h-14 items-center justify-between border-b px-4">
          <h2 id={dialogTitleId} className="text-base font-medium">
            Upload
          </h2>
          <button type="button" onClick={closeDialog} className={buttonCompact}>
            Close
          </button>
        </div>

        <div className="space-y-5 p-4">
          {phase.name === "done" ? (
            <div className="space-y-4">
              <p className="text-sm">
                <span className="font-medium">{phase.label}</span> is stored.
              </p>
              <p className="font-mono text-sm break-all">{phase.record.url}</p>
              <div className="flex flex-wrap items-center gap-2">
                <CopyButton
                  value={phase.record.url}
                  label="Copy the uploaded URL"
                />
                {phase.record.id ? (
                  <Link
                    href={`/uploads/${phase.record.id}`}
                    onClick={closeDialog}
                    className={buttonQuiet}
                  >
                    View upload
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => setPhase({ name: "idle" })}
                  className={buttonQuiet}
                >
                  Upload another
                </button>
              </div>
            </div>
          ) : (
            <>
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  const file = event.dataTransfer.files.item(0);
                  if (file) chooseFile(file);
                }}
                className={
                  "rounded-md border border-dashed p-4 " +
                  (dragging ? "border-foreground" : "border-border")
                }
              >
                <p className="text-muted-foreground text-sm">
                  Drop a file here, paste one, or choose it below.
                </p>
                <div className="mt-3">
                  <label htmlFor={fileInputId} className="sr-only">
                    Choose a file to upload
                  </label>
                  <input
                    ref={fileInput}
                    id={fileInputId}
                    type="file"
                    disabled={busy}
                    onChange={(event) => {
                      const file = event.target.files?.item(0);
                      if (file) chooseFile(file);
                    }}
                    className="file:border-border file:bg-background file:text-foreground block w-full text-sm file:mr-3 file:h-9 file:rounded-md file:border file:px-3 file:text-sm"
                  />
                </div>
              </div>

              {phase.name === "selected" ? (
                <div className="border-border flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                  <p className="min-w-0 text-sm">
                    <span className="block truncate font-medium">
                      {phase.file.name}
                    </span>
                    <span className="text-muted-foreground">
                      {phase.file.type || "unknown type"} ·{" "}
                      {formatBytes(phase.file.size)}
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => void send(phase.file, phase.file.name)}
                    className={buttonPrimary}
                  >
                    Upload file
                  </button>
                </div>
              ) : null}

              {busy ? (
                <div className="border-border space-y-3 rounded-md border p-3">
                  <Progress
                    loaded={phase.loaded}
                    total={phase.total}
                    caption={
                      phase.name === "fetching"
                        ? `Fetching ${phase.label} —`
                        : `Uploading ${phase.label} —`
                    }
                  />
                  <button
                    type="button"
                    onClick={() => controller.current?.abort()}
                    className={buttonQuiet}
                  >
                    Cancel
                  </button>
                </div>
              ) : null}

              <form onSubmit={ingestUrl} className="space-y-2">
                <label htmlFor={urlInputId} className={labelBase}>
                  Or fetch an HTTPS URL
                </label>
                <div className="flex gap-2">
                  <input
                    id={urlInputId}
                    type="url"
                    inputMode="url"
                    placeholder="https://example.com/image.png"
                    value={urlValue}
                    disabled={busy}
                    onChange={(event) => setUrlValue(event.target.value)}
                    aria-describedby={urlHintId}
                    className={inputBase}
                  />
                  <button
                    type="submit"
                    disabled={busy || urlValue.trim().length === 0}
                    className={buttonQuiet}
                  >
                    Fetch
                  </button>
                </div>
                <p id={urlHintId} className="text-muted-foreground text-sm">
                  Your browser downloads the file directly, with no cookies and
                  no referrer. Sites that do not allow cross-origin reads will
                  refuse.
                </p>
              </form>

              {phase.name === "failed" ? (
                <p
                  role="alert"
                  className="border-danger text-danger rounded-md border p-3 text-sm"
                >
                  {phase.message}
                </p>
              ) : null}
            </>
          )}
        </div>
      </dialog>
    </UploadDialogContext.Provider>
  );
}
