"use client";

import Link from "next/link";
import { FileCheck2 } from "lucide-react";
import { useState } from "react";

import { planGifConversion } from "~/components/gif/eligibility";
import { Button } from "~/components/ui/button";
import { CopyButton } from "~/components/ui/copy-button";
import type { MediaDomainChoice } from "~/server/media/origin-preferences";

import { LinkSettings } from "../link-settings";
import { StillGifVariant } from "../still-gif-variant";
import type { UploadedRecord } from "../transport";

/**
 * Step three: the link, and only what this particular file can do.
 *
 * The type is not guessed in the browser — the server reports what it decided,
 * so a GIF affordance appears for an image, a sandbox note appears for a page,
 * and a PDF is offered nothing it cannot support.
 */
export function ResultStep({
  record,
  label,
  file,
  mediaDomains,
  busy,
  onBusyChange,
  onUploadAnother,
  onDone,
}: {
  record: UploadedRecord;
  label: string;
  file: File;
  mediaDomains: MediaDomainChoice[];
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onUploadAnother: () => void;
  onDone: () => void;
}) {
  const [url, setUrl] = useState(record.url);
  const gifPlan = planGifConversion({
    uploadKind: record.kind,
    contentType: record.contentType || file.type,
    hasStoredGif: false,
  });

  return (
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
            {label} is stored and ready to share.
          </p>
        </div>
      </div>

      <div className="border-border bg-sunken rounded-lg border p-3">
        <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
          Permanent URL
        </p>
        <div className="mt-2 flex items-center gap-3">
          <p className="min-w-0 flex-1 font-mono text-xs break-all">{url}</p>
          <CopyButton value={url} label="Copy the uploaded URL" />
        </div>
      </div>

      {record.rendered ? (
        <div className="border-accent/25 bg-accent/10 space-y-3 rounded-lg border px-3 py-3">
          <p className="text-foreground text-sm">
            Published as a page on the media domain, inside a restrictive
            browser sandbox — scripts, forms, frames, and network requests stay
            blocked.
          </p>
          <Button asChild variant="outline" size="sm">
            <a href={url} target="_blank" rel="noreferrer noopener">
              Open page
            </a>
          </Button>
        </div>
      ) : null}

      {record.id && gifPlan.engine === "still" ? (
        <StillGifVariant
          uploadId={record.id}
          file={file}
          record={record}
          onBusyChange={onBusyChange}
        />
      ) : null}

      {gifPlan.engine === "ffmpeg" && record.id ? (
        <p className="text-muted-foreground text-sm">
          This video can be converted to a GIF from its upload page.
        </p>
      ) : null}

      {record.id ? (
        <LinkSettings
          uploadId={record.id}
          currentSlug={record.publicSlug}
          extension={record.extension}
          mediaDomains={mediaDomains}
          currentMediaOrigin={record.mediaOrigin}
          onUrlChange={setUrl}
        />
      ) : null}

      {/* Two ways forward and no more. Closing the dialog is the third, and it
          already has the button every dialog has. */}
      <div className="flex flex-wrap items-center gap-2">
        {record.id ? (
          busy ? (
            <Button type="button" disabled>
              View upload
            </Button>
          ) : (
            <Button asChild>
              <Link href={`/uploads/${record.id}`} onClick={onDone}>
                View upload
              </Link>
            </Button>
          )
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onUploadAnother}
        >
          Upload another
        </Button>
      </div>
    </div>
  );
}
