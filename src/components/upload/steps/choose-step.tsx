"use client";

import { FileUp, Link2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type RefObject } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

/**
 * Step one: put a file in.
 *
 * There is nothing else on this screen on purpose. A slug, a media domain and
 * how an HTML file should be served are all decisions about a link that does
 * not exist yet, so they belong to the step after the bytes are stored — and
 * every one of them has a working default, so most people never open them.
 */
export function ChooseStep({
  accept,
  busy,
  failure,
  browseRef,
  onFile,
  onIngestUrl,
}: {
  accept?: string;
  busy: boolean;
  failure: string | null;
  browseRef: RefObject<HTMLButtonElement | null>;
  onFile: (file: File) => void;
  onIngestUrl: (value: string) => void;
}) {
  const instanceId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const urlInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const dragDepth = useRef(0);
  const urlInputId = `${instanceId}-url`;

  // Revealing the field is the whole point of the press, so focus follows it.
  useEffect(() => {
    if (showUrl) urlInput.current?.focus();
  }, [showUrl]);

  return (
    <div className="space-y-4">
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
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
          if (file) onFile(file);
        }}
        className={
          "flex flex-col items-center gap-4 rounded-xl border border-dashed px-5 py-9 text-center " +
          "transition-[background-color,border-color] duration-150 ease-out " +
          (dragging
            ? "border-accent bg-accent/10"
            : "border-border-strong bg-sunken/55")
        }
      >
        <span className="border-border bg-panel text-muted-foreground grid size-11 place-items-center rounded-lg border">
          <FileUp className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="font-display text-sm font-semibold">Drop a file here</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Or paste one from your clipboard.
          </p>
        </div>
        <input
          ref={fileInput}
          id={`${instanceId}-file`}
          type="file"
          accept={accept}
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.item(0);
            // Clearing the input means picking the same file again still fires
            // a change event, which matters after a refusal: the second attempt
            // would otherwise do nothing at all.
            event.target.value = "";
            if (file) onFile(file);
          }}
          className="sr-only"
        />
        <Button
          ref={browseRef}
          type="button"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          Browse files
        </Button>
      </div>

      {failure ? (
        <p
          role="alert"
          className="border-danger bg-danger/5 text-danger rounded-lg border p-3 text-sm"
        >
          {failure}
        </p>
      ) : null}

      {showUrl ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onIngestUrl(urlValue);
          }}
          className="space-y-2"
        >
          <Label htmlFor={urlInputId}>Public HTTPS URL</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id={urlInputId}
              ref={urlInput}
              type="url"
              inputMode="url"
              placeholder="https://example.com/image.png"
              value={urlValue}
              disabled={busy}
              onChange={(event) => setUrlValue(event.target.value)}
              className="min-w-0 flex-1"
            />
            <Button
              type="submit"
              variant="outline"
              disabled={busy || urlValue.trim().length === 0}
              className="w-full sm:w-auto"
            >
              Import
            </Button>
          </div>
          <p className="text-muted-foreground text-sm">
            Your browser fetches it without cookies or a referrer, so the remote
            site must allow cross-origin reads.
          </p>
        </form>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => setShowUrl(true)}
          className="px-0 hover:bg-transparent"
        >
          <Link2 className="size-4" aria-hidden="true" />
          Import from a URL instead
        </Button>
      )}
    </div>
  );
}
