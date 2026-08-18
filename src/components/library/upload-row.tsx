import Link from "next/link";

import { uploadUrl } from "~/components/data/uploads";
import {
  formatBytes,
  formatTimestamp,
  lifecycleLabel,
  uploadKindLabel,
} from "~/components/lib/format";
import { CopyButton } from "~/components/ui/copy-button";
import type { SerializedUpload } from "~/server/uploads/serialization";

import { PreviewThumb } from "./preview-thumb";

export const ROW_HEIGHT_CLASS = "h-16 md:h-14";

/**
 * One library row: exactly 64px below 768px and 56px above it.
 *
 * Row-wide navigation is a single anchor that grows an overlay across the row
 * (`.row-link`), and the Copy control lifts above that overlay (`.row-control`).
 * They are siblings, never nested, so the row exposes one link and one button
 * to assistive technology and to the browser's own focus order.
 */
export function UploadRow({ upload }: { upload: SerializedUpload }) {
  const url = uploadUrl(upload);
  const origin = `${new URL(url).origin}/`;
  const name = `${upload.publicSlug}.${upload.extension}`;
  const lifecycle = lifecycleLabel(upload.state);

  return (
    <li
      className={`relative flex ${ROW_HEIGHT_CLASS} border-border items-center gap-3 border-b px-3 last:border-b-0`}
    >
      <PreviewThumb upload={upload} />

      <span className="flex min-w-0 flex-1 flex-col justify-center">
        <Link
          href={`/uploads/${upload.id}`}
          className="row-link flex min-w-0 items-baseline font-mono text-sm"
        >
          {/* The origin is identical on every row and yields first; the slug and
              extension are the identifying part and never ellipsize. */}
          <span className="text-muted-foreground truncate">{origin}</span>
          <span className="shrink-0">{name}</span>
        </Link>
        <span className="text-muted-foreground truncate text-xs">
          {upload.originalName} ·{" "}
          {uploadKindLabel(upload.kind, upload.contentType)} ·{" "}
          {formatBytes(upload.byteSize)} · {formatTimestamp(upload.createdAt)}
          {lifecycle ? (
            <>
              {" · "}
              <span
                className={
                  upload.state === "DELETE_FAILED" ? "text-danger" : ""
                }
              >
                {lifecycle}
              </span>
            </>
          ) : null}
        </span>
      </span>

      <span className="row-control">
        <CopyButton value={url} label={`Copy URL for ${upload.originalName}`} />
      </span>
    </li>
  );
}

/**
 * The row's exact geometry with no content. Suspense fallbacks reuse it so the
 * list frame never resizes when real rows arrive.
 */
export function UploadRowSkeleton() {
  return (
    <li
      aria-hidden="true"
      className={`flex ${ROW_HEIGHT_CLASS} border-border items-center gap-3 border-b px-3 last:border-b-0`}
    >
      <span className="border-border bg-background h-10 w-10 shrink-0 rounded border" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="bg-border block h-3.5 w-2/3 rounded" />
        <span className="bg-border block h-3 w-1/3 rounded" />
      </span>
      <span className="border-border h-9 w-20 shrink-0 rounded-md border" />
    </li>
  );
}
