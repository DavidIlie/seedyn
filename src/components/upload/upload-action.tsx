"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileCheck2, FileUp, Link2, XIcon } from "lucide-react";
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
import { planGifConversion } from "~/components/gif/eligibility";
import { GIF_MAX_OUTPUT_BYTES } from "~/components/gif/options";
import { SlugAvailabilityField } from "~/components/slug/slug-availability-field";
import { CopyButton } from "~/components/ui/copy-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  buttonDanger,
  buttonPrimary,
  buttonQuiet,
  inputBase,
  labelBase,
} from "~/components/ui/styles";
import type { MediaDomainChoice } from "~/server/media/origin-preferences";

import { BROWSER_UPLOAD_ENDPOINT, browserGifEndpoint } from "./endpoints";
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
 * The shadcn/Radix dialog carries modal semantics, focus trapping/restoration,
 * outside-press dismissal, and Escape handling. Seedyn still owns the transfer
 * state machine and refuses to discard an active operation silently.
 */

type Phase =
  | { name: "idle" }
  | { name: "selected"; file: File }
  | { name: "fetching"; label: string; loaded: number; total: number | null }
  | { name: "uploading"; label: string; loaded: number; total: number | null }
  | {
      name: "done";
      record: UploadedRecord;
      label: string;
      file: File;
      quickGif: boolean;
    }
  | { name: "failed"; code: string; message: string };

const MAX_UPLOAD_BYTES = URL_INGEST_BYTE_CAP;
type OpenDialogOptions = { autoStart?: boolean; quickGif?: boolean };
type OpenUploadDialog = (file?: File, options?: OpenDialogOptions) => void;
const UploadDialogContext = createContext<OpenUploadDialog | null>(null);

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement)
  );
}

function clipboardLabel(file: File): string {
  return file.name && file.name !== "image.png" ? file.name : "Clipboard image";
}

function uploadedFormat(record: UploadedRecord): string {
  if (record.extension) return record.extension.toLocaleUpperCase();
  try {
    return (
      new URL(record.url).pathname.split(".").at(-1) ?? "file"
    ).toLocaleUpperCase();
  } catch {
    return "FILE";
  }
}

function isHtmlFile(file: File): boolean {
  return (
    /\.(?:html?|xhtml)$/iu.test(file.name) ||
    file.type.toLowerCase().split(";", 1)[0] === "text/html"
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
  compactOnNarrow = false,
}: {
  className?: string;
  label?: string;
  tone?: "primary" | "quiet";
  compactOnNarrow?: boolean;
}) {
  const openDialog = useContext(UploadDialogContext);
  if (!openDialog) {
    throw new Error("UploadAction must be rendered inside UploadProvider");
  }

  return (
    <button
      type="button"
      onClick={() => openDialog()}
      className={`${tone === "primary" ? buttonPrimary : buttonQuiet} ${compactOnNarrow ? "max-[390px]:size-11 max-[390px]:px-0" : ""} ${className}`}
    >
      <UploadArrow />
      <span className={compactOnNarrow ? "max-[390px]:sr-only" : undefined}>
        {label}
      </span>
    </button>
  );
}

export function UploadProvider({
  children,
  mediaDomains,
}: {
  children: React.ReactNode;
  mediaDomains: MediaDomainChoice[];
}) {
  const instanceId = useId();
  const fileInputId = `${instanceId}-upload-file`;
  const urlInputId = `${instanceId}-upload-url`;
  const urlHintId = `${instanceId}-upload-url-hint`;
  const fileInput = useRef<HTMLInputElement>(null);
  const browseButton = useRef<HTMLButtonElement>(null);
  const keepUploadingButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const controller = useRef<AbortController | null>(null);
  const dragDepth = useRef(0);
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [dragging, setDragging] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [slugValue, setSlugValue] = useState("");
  const [mediaDomain, setMediaDomain] = useState("");
  const [renderHtml, setRenderHtml] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [quickGifBusy, setQuickGifBusy] = useState(false);

  const transferBusy = phase.name === "uploading" || phase.name === "fetching";
  const busy = transferBusy || quickGifBusy;

  const send = useCallback(
    async (
      file: File,
      sourceLabel: string,
      quickGif = false,
      customSlug = slugValue,
      requestedMediaDomain = mediaDomain,
      renderHtmlPage = renderHtml,
    ) => {
      if (controller.current) return;
      if (customSlug && slugAvailable !== true) {
        setPhase({
          name: "failed",
          code: "slug_unavailable",
          message: "Choose an available custom URL slug or leave it blank.",
        });
        return;
      }
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
        const fields: Record<string, string> = {};
        if (customSlug) fields.slug = customSlug;
        if (requestedMediaDomain) fields.mediaDomain = requestedMediaDomain;
        if (renderHtmlPage) fields.renderHtml = "true";
        const record = await postMultipart({
          endpoint: BROWSER_UPLOAD_ENDPOINT,
          body: file,
          filename: file.name || "upload",
          fields: Object.keys(fields).length > 0 ? fields : undefined,
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
        setOwnedPhase({
          name: "done",
          record,
          label: sourceLabel,
          file,
          quickGif,
        });
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
    [mediaDomain, renderHtml, router, slugAvailable, slugValue],
  );

  const changeSlug = useCallback((value: string) => {
    setSlugValue(value);
    setSlugAvailable(value ? false : null);
  }, []);

  const chooseFile = useCallback((file: File) => {
    if (controller.current) return;
    if (!isHtmlFile(file)) setRenderHtml(false);
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
      if (busy || controller.current) return;
      if (isEditableTarget(event.target)) return;
      const data = event.clipboardData;
      if (!data) return;
      const file = data.files.item(0);
      if (file) {
        event.preventDefault();
        if (isHtmlFile(file)) chooseFile(file);
        else
          void send(file, clipboardLabel(file), file.type.startsWith("image/"));
        return;
      }
      const text = data.getData("text/plain").trim();
      if (text.startsWith("https://")) setUrlValue(text);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [busy, chooseFile, open, send]);

  useEffect(() => {
    if (confirmingClose) keepUploadingButton.current?.focus();
  }, [confirmingClose]);

  useEffect(() => {
    if (!busy) setConfirmingClose(false);
  }, [busy]);

  useEffect(() => {
    if (!busy) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [busy]);

  const openDialog = useCallback(
    (file?: File, options?: OpenDialogOptions) => {
      returnFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      if (fileInput.current) fileInput.current.value = "";
      setPhase(file ? { name: "selected", file } : { name: "idle" });
      setUrlValue("");
      setSlugValue("");
      setMediaDomain("");
      setRenderHtml(false);
      setSlugAvailable(null);
      dragDepth.current = 0;
      setDragging(false);
      setConfirmingClose(false);
      setQuickGifBusy(false);
      setOpen(true);

      if (file && options?.autoStart) {
        const label = options.quickGif ? clipboardLabel(file) : file.name;
        void send(
          file,
          label || "Dropped file",
          options.quickGif ?? false,
          "",
          "",
          false,
        );
      }
    },
    [send],
  );

  // UploadProvider exists only inside the authenticated application layout, so
  // a deliberate file paste/drop can open the canonical upload state machine
  // from any app page. Editable fields and in-flight operations are never
  // intercepted.
  useEffect(() => {
    if (open) return undefined;

    const onDragOver = (event: DragEvent) => {
      if (isEditableTarget(event.target)) return;
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      if (isEditableTarget(event.target) || controller.current) return;
      const file = event.dataTransfer?.files.item(0);
      if (!file) return;
      event.preventDefault();
      openDialog(file, { autoStart: true });
    };
    const onClosedPaste = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target) || controller.current) return;
      const file = event.clipboardData?.files.item(0);
      if (!file) return;
      event.preventDefault();
      openDialog(file, {
        autoStart: true,
        quickGif: file.type.startsWith("image/"),
      });
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

  function finishClose() {
    setOpen(false);
    setPhase({ name: "idle" });
    setQuickGifBusy(false);
    setConfirmingClose(false);
    setUrlValue("");
    setSlugValue("");
    setMediaDomain("");
    setRenderHtml(false);
    setSlugAvailable(null);
    dragDepth.current = 0;
    setDragging(false);
  }

  function requestClose() {
    if (busy) {
      setConfirmingClose(true);
      return;
    }
    finishClose();
  }

  function cancelAndClose() {
    const active = controller.current;
    controller.current = null;
    active?.abort();
    finishClose();
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

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) setOpen(true);
          else requestClose();
        }}
      >
        <DialogContent
          showCloseButton={false}
          onOpenAutoFocus={(event) => {
            if (phase.name !== "idle") return;
            event.preventDefault();
            browseButton.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (!busy) return;
            event.preventDefault();
            setConfirmingClose(true);
          }}
          onPointerDownOutside={(event) => {
            if (!busy) return;
            event.preventDefault();
            setConfirmingClose(true);
          }}
          className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-xl"
        >
          <DialogHeader className="border-border border-b px-5 py-4 pr-16">
            <div className="flex items-start gap-3">
              <span className="border-border bg-sunken text-accent grid size-10 shrink-0 place-items-center rounded-lg border">
                <FileUp className="size-[18px]" aria-hidden="true" />
              </span>
              <div className="min-w-0 space-y-1">
                <DialogTitle>Upload</DialogTitle>
                <DialogDescription>
                  Store a file, paste from your clipboard, or import a public
                  HTTPS URL.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <button
            type="button"
            aria-label="Close upload dialog"
            onClick={requestClose}
            className="text-muted-foreground hover:border-border-strong hover:bg-sunken hover:text-foreground absolute top-3.5 right-3.5 grid size-11 place-items-center rounded-lg border border-transparent transition-colors focus-visible:outline-offset-2 md:size-10"
          >
            <XIcon className="size-4" aria-hidden="true" />
          </button>

          <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain p-5">
            {phase.name === "done" ? (
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <span className="border-accent/30 bg-accent/10 text-accent grid size-10 shrink-0 place-items-center rounded-full border">
                    <FileCheck2 className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-base font-semibold">
                      Upload complete
                    </p>
                    <p className="text-muted-foreground mt-1 truncate text-sm">
                      {phase.label} is stored and ready to share.
                    </p>
                  </div>
                </div>
                <div className="border-border bg-sunken rounded-lg border p-3">
                  <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
                    {phase.quickGif
                      ? `${uploadedFormat(phase.record)} URL`
                      : "Permanent URL"}
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <p className="min-w-0 flex-1 font-mono text-xs break-all">
                      {phase.record.url}
                    </p>
                    <CopyButton
                      value={phase.record.url}
                      label={
                        phase.quickGif
                          ? `Copy the ${uploadedFormat(phase.record)} URL`
                          : "Copy the uploaded URL"
                      }
                    />
                  </div>
                </div>
                {phase.record.contentType
                  ?.toLowerCase()
                  .startsWith("text/html;") ? (
                  <p className="border-accent/25 bg-accent/10 text-foreground rounded-lg border px-3 py-2 text-sm">
                    Sandboxed HTML page · scripts, forms, frames, and network
                    requests are blocked.
                  </p>
                ) : null}
                {phase.quickGif && phase.record.id ? (
                  <QuickGifUrl
                    uploadId={phase.record.id}
                    file={phase.file}
                    record={phase.record}
                    onBusyChange={setQuickGifBusy}
                  />
                ) : null}
                {confirmingClose ? (
                  <div
                    role="alert"
                    className="border-danger bg-danger/5 rounded-lg border p-4"
                  >
                    <p className="font-display text-sm font-semibold">
                      Cancel this transfer?
                    </p>
                    <p className="text-muted-foreground mt-1 text-sm">
                      Closing now stops the active GIF operation. The original
                      URL remains stored.
                    </p>
                    <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <button
                        ref={keepUploadingButton}
                        type="button"
                        onClick={() => setConfirmingClose(false)}
                        className={buttonQuiet}
                      >
                        Keep working
                      </button>
                      <button
                        type="button"
                        onClick={cancelAndClose}
                        className={buttonDanger}
                      >
                        Cancel and close
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  {phase.record.id ? (
                    busy ? (
                      <button type="button" disabled className={buttonPrimary}>
                        View upload
                      </button>
                    ) : (
                      <Link
                        href={`/uploads/${phase.record.id}`}
                        onClick={finishClose}
                        className={buttonPrimary}
                      >
                        View upload
                      </Link>
                    )
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (fileInput.current) fileInput.current.value = "";
                      setQuickGifBusy(false);
                      setSlugValue("");
                      setSlugAvailable(null);
                      setRenderHtml(false);
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
                    if (file) {
                      if (isHtmlFile(file)) chooseFile(file);
                      else void send(file, file.name || "Dropped file");
                    }
                  }}
                  className={
                    "rounded-xl border border-dashed p-5 transition-[background-color,border-color] duration-150 " +
                    (dragging
                      ? "border-accent bg-accent/10"
                      : "border-border-strong bg-sunken/55")
                  }
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <span className="border-border bg-panel text-muted-foreground grid size-11 shrink-0 place-items-center rounded-lg border">
                      <FileUp className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1 text-left">
                      <p className="font-display text-sm font-semibold">
                        Drop a file here
                      </p>
                      <p className="text-muted-foreground mt-1 text-sm">
                        Or paste a file anywhere in this dialog.
                      </p>
                    </div>
                    <input
                      ref={fileInput}
                      id={fileInputId}
                      type="file"
                      disabled={busy}
                      onChange={(event) => {
                        const file = event.target.files?.item(0);
                        if (file) chooseFile(file);
                      }}
                      className="sr-only"
                    />
                    <button
                      ref={browseButton}
                      type="button"
                      disabled={busy}
                      onClick={() => fileInput.current?.click()}
                      className={`${buttonPrimary} w-full sm:w-auto`}
                    >
                      Browse files
                    </button>
                  </div>
                </div>

                <SlugAvailabilityField
                  value={slugValue}
                  onChange={changeSlug}
                  onAvailabilityChange={setSlugAvailable}
                  disabled={busy}
                />

                <div className="space-y-2">
                  <label
                    htmlFor={`${instanceId}-media-domain`}
                    className={labelBase}
                  >
                    Media domain
                  </label>
                  <select
                    id={`${instanceId}-media-domain`}
                    value={mediaDomain}
                    onChange={(event) => setMediaDomain(event.target.value)}
                    disabled={busy}
                    className={inputBase}
                  >
                    <option value="">Account default</option>
                    {mediaDomains.map((domain) => (
                      <option key={domain.id} value={domain.id}>
                        {domain.host}
                      </option>
                    ))}
                  </select>
                  <p className="text-muted-foreground text-sm">
                    The returned link uses this domain. The same object remains
                    available on every configured media host.
                  </p>
                </div>

                <div className="border-border bg-sunken/55 flex items-start gap-3 rounded-lg border p-3">
                  <input
                    id={`${instanceId}-render-html`}
                    type="checkbox"
                    checked={renderHtml}
                    onChange={(event) => setRenderHtml(event.target.checked)}
                    disabled={
                      busy ||
                      (phase.name === "selected" && !isHtmlFile(phase.file))
                    }
                    className="border-border-strong text-accent focus-visible:ring-accent mt-0.5 size-4 rounded"
                  />
                  <span className="min-w-0">
                    <label
                      htmlFor={`${instanceId}-render-html`}
                      className="block cursor-pointer text-sm font-medium"
                    >
                      Render HTML as a page
                    </label>
                    <span className="text-muted-foreground mt-0.5 block text-sm leading-5">
                      Opt in for a UTF-8 HTML file. It opens on the separate
                      media domain inside a restrictive browser sandbox;
                      scripts, forms, frames, and network requests stay blocked.
                    </span>
                  </span>
                </div>

                {phase.name === "selected" ? (
                  <div className="border-border bg-panel flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                    <p className="min-w-0 flex-1 text-sm">
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

                {transferBusy ? (
                  <div className="border-border bg-sunken/55 space-y-4 rounded-lg border p-4">
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
                      Cancel transfer
                    </button>
                  </div>
                ) : null}

                <div className="border-border space-y-3 border-t pt-5">
                  <div className="flex items-start gap-3">
                    <Link2
                      className="text-muted-foreground mt-0.5 size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-medium">Import from URL</p>
                      <p className="text-muted-foreground mt-0.5 text-sm">
                        Bring in a publicly accessible file without downloading
                        it first.
                      </p>
                    </div>
                  </div>
                  <form onSubmit={ingestUrl} className="space-y-2">
                    <label
                      htmlFor={urlInputId}
                      className={`${labelBase} sr-only`}
                    >
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
                </div>

                {phase.name === "failed" ? (
                  <p
                    role="alert"
                    className="border-danger bg-danger/5 text-danger rounded-lg border p-3 text-sm"
                  >
                    {phase.message}
                  </p>
                ) : null}

                {confirmingClose ? (
                  <div
                    role="alert"
                    className="border-danger bg-danger/5 rounded-lg border p-4"
                  >
                    <p className="font-display text-sm font-semibold">
                      Cancel this transfer?
                    </p>
                    <p className="text-muted-foreground mt-1 text-sm">
                      Closing now stops the active transfer. Nothing incomplete
                      is added to your library.
                    </p>
                    <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <button
                        ref={keepUploadingButton}
                        type="button"
                        onClick={() => setConfirmingClose(false)}
                        className={buttonQuiet}
                      >
                        Keep uploading
                      </button>
                      <button
                        type="button"
                        onClick={cancelAndClose}
                        className={buttonDanger}
                      >
                        Cancel and close
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </UploadDialogContext.Provider>
  );
}

type QuickGifStage =
  | { name: "idle" }
  | { name: "converting" }
  | { name: "uploading"; blob: Blob; loaded: number; total: number | null }
  | { name: "stored"; url: string }
  | { name: "failed"; message: string; blob: Blob | null };

function QuickGifUrl({
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
  const [stage, setStage] = useState<QuickGifStage>({ name: "idle" });
  const plan = planGifConversion({
    uploadKind: record.kind ?? "",
    contentType: record.contentType ?? file.type,
    hasStoredGif: false,
  });

  useEffect(() => {
    return () => {
      const active = controller.current;
      controller.current = null;
      active?.abort();
      onBusyChange(false);
    };
  }, [onBusyChange]);

  if (plan.engine !== "still") return null;

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
    const ownsOperation = () => controller.current === abort;
    const setOwnedStage = (next: QuickGifStage) => {
      if (ownsOperation()) setStage(next);
    };
    onBusyChange(true);

    let blob = retainedBlob ?? null;
    try {
      if (!blob) {
        setOwnedStage({ name: "converting" });
        const bytes = await file.arrayBuffer();
        if (abort.signal.aborted || !ownsOperation()) return;
        const { encodeStillGif } = await import(
          "~/components/gif/still-gif-client"
        );
        const result = await encodeStillGif({
          bytes,
          contentType: record.contentType ?? file.type,
          signal: abort.signal,
        });
        blob = result.blob;
      }

      if (abort.signal.aborted || !ownsOperation()) return;
      if (blob.size > GIF_MAX_OUTPUT_BYTES) {
        setOwnedStage({
          name: "failed",
          message:
            "The GIF is " +
            formatBytes(blob.size) +
            ", over the " +
            formatBytes(GIF_MAX_OUTPUT_BYTES) +
            " limit.",
          blob: null,
        });
        return;
      }

      setOwnedStage({
        name: "uploading",
        blob,
        loaded: 0,
        total: blob.size,
      });
      const gif = await postMultipart({
        endpoint: browserGifEndpoint(uploadId),
        body: blob,
        filename: "variant.gif",
        signal: abort.signal,
        onProgress: (loaded, total) =>
          setOwnedStage({ name: "uploading", blob: blob!, loaded, total }),
      });
      if (abort.signal.aborted || !ownsOperation()) return;
      setOwnedStage({ name: "stored", url: gif.url });
      router.refresh();
    } catch (error) {
      if (abort.signal.aborted || !ownsOperation()) return;
      const failure =
        error instanceof TransportError
          ? error
          : new TransportError(
              "conversion_failed",
              error instanceof Error
                ? error.message
                : "The GIF could not be created in this browser.",
            );
      setOwnedStage({
        name: "failed",
        message: failure.message,
        blob,
      });
    } finally {
      if (ownsOperation()) {
        controller.current = null;
        onBusyChange(false);
      }
    }
  }

  return (
    <div className="border-border rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">GIF URL</p>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Create and store it here—no detail-page detour.
          </p>
        </div>
        {stage.name === "idle" ? (
          <button
            type="button"
            onClick={() => void createGif()}
            className={buttonQuiet}
          >
            Create GIF URL
          </button>
        ) : null}
      </div>

      {stage.name === "converting" ? (
        <div className="mt-4">
          <p role="status" className="text-muted-foreground text-sm">
            Encoding one GIF frame in your browser…
          </p>
          <button
            type="button"
            onClick={cancel}
            className={buttonQuiet + " mt-3"}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {stage.name === "uploading" ? (
        <div className="mt-4 space-y-3">
          <Progress
            loaded={stage.loaded}
            total={stage.total}
            caption="Storing the GIF —"
          />
          <button type="button" onClick={cancel} className={buttonQuiet}>
            Cancel
          </button>
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
          <button
            type="button"
            onClick={() => void createGif(stage.blob ?? undefined)}
            className={buttonQuiet + " mt-3"}
          >
            Retry GIF
          </button>
        </div>
      ) : null}
    </div>
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
