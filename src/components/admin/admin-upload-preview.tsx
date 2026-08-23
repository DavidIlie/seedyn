"use client";

import { ExternalLink, File, LockKeyhole, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  formatBytes,
  formatTimestamp,
  uploadKindLabel,
} from "~/components/lib/format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { CopyButton } from "~/components/ui/copy-button";
import { Button } from "~/components/ui/button";
import { UploadOriginBadge } from "~/components/upload/origin-badge";
import type { AdminUploadRow } from "~/server/admin/uploads";

async function responseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: { message?: unknown };
    };
    if (typeof payload.error?.message === "string") {
      return payload.error.message;
    }
  } catch {
    // Media endpoints intentionally return empty failures; use the safe copy.
  }
  return `The request failed (${response.status}).`;
}

export function AdminUploadPreview({
  row,
  open,
  onOpenChange,
  onDeleted,
}: {
  row: AdminUploadRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: (uploadId: string) => void;
}) {
  const { upload, owner, url } = row;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function deleteUpload() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/admin/uploads/${upload.id}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(await responseError(response));
      onDeleted(upload.id);
    } catch (cause) {
      setDeleteError(
        cause instanceof Error
          ? cause.message
          : "The upload could not be deleted. Try again.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!deleting) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-1rem)] gap-0 overflow-y-auto p-0 sm:max-h-[calc(100dvh-2rem)] sm:max-w-3xl">
        <DialogHeader className="border-border border-b px-4 py-4 pr-16 sm:px-5">
          <DialogTitle className="truncate pr-2">
            {upload.originalName}
          </DialogTitle>
          <DialogDescription className="truncate">
            {owner.name ?? owner.email ?? "Unknown owner"}
            {owner.name && owner.email ? ` · ${owner.email}` : ""}
          </DialogDescription>
        </DialogHeader>

        <MediaPreview row={row} />

        <div className="grid gap-5 px-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5">
          <dl className="grid min-w-0 grid-cols-2 gap-x-5 gap-y-4 text-sm sm:grid-cols-3">
            <PreviewFact
              label="Type"
              value={uploadKindLabel(upload.kind, upload.contentType)}
            />
            <PreviewFact label="Size" value={formatBytes(upload.byteSize)} />
            <PreviewFact
              label="Uploaded"
              value={formatTimestamp(upload.createdAt)}
            />
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-muted-foreground text-xs">Public name</dt>
              <dd className="mt-1 truncate font-mono text-xs">
                {upload.publicSlug}.{upload.extension}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Access</dt>
              <dd className="mt-1 flex items-center gap-1.5 text-xs font-medium">
                {upload.passwordProtected ? (
                  <>
                    <LockKeyhole aria-hidden="true" className="size-3.5" />
                    Password
                  </>
                ) : (
                  "Public link"
                )}
              </dd>
            </div>
          </dl>
          <div className="flex items-start sm:justify-end">
            <UploadOriginBadge provenance={upload.provenance} />
          </div>
        </div>

        {deleteError ? (
          <p
            role="alert"
            className="border-danger/35 bg-danger/5 text-danger mx-4 mb-4 rounded-lg border p-3 text-sm sm:mx-5"
          >
            {deleteError}
          </p>
        ) : null}

        <DialogFooter className="border-border bg-sunken/45 border-t p-4 sm:px-5">
          {confirmingDelete ? (
            <>
              <p className="text-muted-foreground mr-auto text-left text-sm">
                Delete this original and every generated variant permanently?
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={deleting}
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleting}
                onClick={() => void deleteUpload()}
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="destructive"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 aria-hidden="true" className="size-4" />
                Delete
              </Button>
              <div className="flex flex-1 flex-wrap justify-end gap-2">
                <CopyButton value={url} label="Copy public URL" />
                <Button variant="outline" asChild>
                  <a href={url} target="_blank" rel="noreferrer">
                    Open link
                    <ExternalLink aria-hidden="true" className="size-4" />
                  </a>
                </Button>
              </div>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MediaPreview({ row }: { row: AdminUploadRow }) {
  const { upload } = row;
  const contentUrl = `/api/admin/uploads/${upload.id}/content`;

  if (upload.kind === "IMAGE") {
    return (
      <div className="bg-sunken grid min-h-64 place-items-center overflow-hidden p-3 sm:min-h-80 sm:p-5">
        {/* oxlint-disable-next-line next/no-img-element -- private admin bytes must not pass through the image optimizer */}
        <img
          src={contentUrl}
          alt={`Preview of ${upload.originalName}`}
          className="max-h-[55dvh] max-w-full rounded-lg object-contain shadow-sm"
        />
      </div>
    );
  }
  if (upload.kind === "VIDEO") {
    return (
      <div className="bg-sunken grid min-h-64 place-items-center overflow-hidden p-3 sm:min-h-80 sm:p-5">
        {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- arbitrary uploads do not include a captions asset */}
        <video
          src={contentUrl}
          controls
          preload="metadata"
          className="max-h-[55dvh] max-w-full rounded-lg bg-black shadow-sm"
        >
          Video preview is not supported by this browser.
        </video>
      </div>
    );
  }
  if (upload.kind === "TEXT") {
    return <TextPreview contentUrl={contentUrl} />;
  }
  return (
    <div className="bg-sunken grid min-h-64 place-items-center p-6 text-center">
      <div>
        <span className="border-border bg-panel mx-auto grid size-14 place-items-center rounded-xl border">
          <File aria-hidden="true" className="text-muted-foreground size-6" />
        </span>
        <p className="mt-4 text-sm font-semibold">No inline preview</p>
        <p className="text-muted-foreground mt-1 max-w-sm text-sm">
          The stored file metadata is available below. Use the public link to
          download it.
        </p>
      </div>
    </div>
  );
}

function TextPreview({ contentUrl }: { contentUrl: string }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready"; text: string; truncated: boolean }
  >({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    void fetch(contentUrl, {
      credentials: "same-origin",
      headers: { Accept: "text/plain" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("text preview failed");
        return {
          text: await response.text(),
          truncated:
            response.headers.get("x-seedyn-preview-truncated") === "true",
        };
      })
      .then((preview) => setState({ status: "ready", ...preview }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, [contentUrl]);

  if (state.status === "loading") {
    return (
      <div className="bg-sunken grid min-h-64 place-items-center text-sm">
        Loading text preview…
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="bg-sunken grid min-h-64 place-items-center px-6 text-center text-sm">
        Text preview could not be loaded.
      </div>
    );
  }
  return (
    <div className="bg-sunken overflow-hidden p-3 sm:p-5">
      <pre className="border-border bg-panel max-h-[55dvh] overflow-auto rounded-lg border p-4 font-mono text-xs leading-5 whitespace-pre sm:text-sm">
        {state.text || "(empty file)"}
      </pre>
      {state.truncated ? (
        <p className="text-muted-foreground mt-2 text-xs">
          Preview limited to the first 64 KiB.
        </p>
      ) : null}
    </div>
  );
}

function PreviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 truncate text-xs font-medium tabular-nums">
        {value}
      </dd>
    </div>
  );
}
