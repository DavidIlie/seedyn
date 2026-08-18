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
const UploadDialogContext = createContext<((file?: File) => void) | null>(null);
const DROP_ENABLED_PATHS = new Set([
  "/dashboard",
  "/images",
  "/files",
  "/texts",
]);

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement)
  );
}

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
  tone = "primary",
}: {
  className?: string;
  label?: string;
  tone?: "primary" | "quiet";
}) {
  const openDialog = useContext(UploadDialogContext);
  if (!openDialog) {
    throw new Error("UploadAction must be rendered inside UploadProvider");
  }

  return (
    <button
      type="button"
      onClick={() => openDialog()}
      className={`${tone === "primary" ? buttonPrimary : buttonQuiet} ${className}`}
    >
      <UploadArrow />
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
  const dragDepth = useRef(0);
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
      if (isEditableTarget(event.target)) return;
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

  const openDialog = useCallback((file?: File) => {
    if (fileInput.current) fileInput.current.value = "";
    setPhase(file ? { name: "selected", file } : { name: "idle" });
    setUrlValue("");
    dragDepth.current = 0;
    setDragging(false);
    setOpen(true);
    dialog.current?.showModal();
  }, []);

  // The four library surfaces accept a dropped or pasted file even before the
  // dialog is open. They still hand it to the one canonical state machine;
  // editable fields and an in-flight operation are never intercepted.
  useEffect(() => {
    if (open) return undefined;

    const isDropEnabled = () =>
      DROP_ENABLED_PATHS.has(window.location.pathname);

    const onDragOver = (event: DragEvent) => {
      if (!isDropEnabled()) return;
      if (isEditableTarget(event.target)) return;
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      if (!isDropEnabled()) return;
      if (isEditableTarget(event.target) || controller.current) return;
      const file = event.dataTransfer?.files.item(0);
      if (!file) return;
      event.preventDefault();
      openDialog(file);
    };
    const onClosedPaste = (event: ClipboardEvent) => {
      if (!isDropEnabled()) return;
      if (isEditableTarget(event.target) || controller.current) return;
      const file = event.clipboardData?.files.item(0);
      if (!file) return;
      event.preventDefault();
      openDialog(file);
    };

    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    document.addEventListener("paste", onClosedPaste);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
      document.removeEventListener("paste", onClosedPaste);
    };
  }, [open, openDialog]);

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
        className="border-border bg-panel text-foreground backdrop:bg-foreground/35 m-auto max-h-[calc(100dvh-2rem)] w-[min(34rem,calc(100vw-2rem))] overflow-hidden rounded-xl border p-0"
      >
        <div className="border-border flex h-14 items-center justify-between border-b px-4">
          <h2
            id={dialogTitleId}
            className="font-display text-base font-semibold"
          >
            Upload
          </h2>
          <button type="button" onClick={closeDialog} className={buttonCompact}>
            Close
          </button>
        </div>

        <div className="max-h-[calc(100dvh-5.5rem)] space-y-5 overflow-y-auto overscroll-contain p-4">
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
                  onClick={() => {
                    if (fileInput.current) fileInput.current.value = "";
                    setPhase({ name: "idle" });
                  }}
                  className={buttonQuiet}
                >
                  Upload another
                </button>
              </div>
            </div>
          ) : (
            <>
              <div
                onDragEnter={(event) => {
                  event.preventDefault();
                  dragDepth.current += 1;
                  setDragging(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  dragDepth.current = Math.max(0, dragDepth.current - 1);
                  if (dragDepth.current === 0) setDragging(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  dragDepth.current = 0;
                  setDragging(false);
                  const file = event.dataTransfer.files.item(0);
                  if (file) chooseFile(file);
                }}
                className={
                  "rounded-xl border border-dashed px-5 py-6 text-center transition-colors " +
                  (dragging ? "border-accent bg-sunken" : "border-border")
                }
              >
                <p className="font-display text-sm font-semibold">
                  Drop a file here
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  You can also paste a file from your clipboard.
                </p>
                <div className="mt-4 flex justify-center">
                  <input
                    ref={fileInput}
                    id={fileInputId}
                    type="file"
                    disabled={busy}
                    onChange={(event) => {
                      const file = event.target.files?.item(0);
                      if (file) chooseFile(file);
                    }}
                    className="peer sr-only"
                  />
                  <label
                    htmlFor={fileInputId}
                    className={`${buttonQuiet} peer-focus-visible:outline-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2`}
                  >
                    Browse files
                  </label>
                </div>
              </div>

              {phase.name === "selected" ? (
                <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-4">
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
                <div className="border-border space-y-3 border-t pt-4">
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

              <details className="border-border group border-t">
                <summary className="flex h-11 cursor-pointer list-none items-center justify-between text-sm font-medium [&::-webkit-details-marker]:hidden">
                  Import from an HTTPS URL
                  <span
                    aria-hidden="true"
                    className="text-muted-foreground text-lg leading-none transition-transform duration-150 group-open:rotate-45 motion-reduce:transform-none"
                  >
                    +
                  </span>
                </summary>
                <form
                  onSubmit={ingestUrl}
                  className="border-border space-y-2 border-t pt-4"
                >
                  <label htmlFor={urlInputId} className={labelBase}>
                    HTTPS URL
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      id={urlInputId}
                      type="url"
                      inputMode="url"
                      placeholder="https://example.com/image.png"
                      value={urlValue}
                      disabled={busy}
                      onChange={(event) => setUrlValue(event.target.value)}
                      aria-describedby={urlHintId}
                      className={`${inputBase} min-w-0 flex-1`}
                    />
                    <button
                      type="submit"
                      disabled={busy || urlValue.trim().length === 0}
                      className={`${buttonQuiet} w-full sm:w-auto`}
                    >
                      Import
                    </button>
                  </div>
                  <p id={urlHintId} className="text-muted-foreground text-sm">
                    The browser fetches it without cookies or a referrer. The
                    remote site must allow cross-origin reads.
                  </p>
                </form>
              </details>

              {phase.name === "failed" ? (
                <p
                  role="alert"
                  className="border-danger text-danger rounded-lg border p-3 text-sm"
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

function UploadArrow() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 11V2.75M4.75 6 8 2.75 11.25 6M2.5 10.5v2.75h11V10.5" />
    </svg>
  );
}
