import Link from "next/link";

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
export function UploadRow({
  upload,
  url,
  privacy = false,
}: {
  upload: SerializedUpload;
  url: string;
  privacy?: boolean;
}) {
  const lifecycle = lifecycleLabel(upload.state);

  return (
    <li
      className={`relative flex ${ROW_HEIGHT_CLASS} border-border hover:bg-sunken/70 focus-within:bg-sunken/70 items-center gap-3 border-b px-3 transition-colors last:border-b-0`}
    >
      <PreviewThumb upload={upload} url={url} privacy={privacy} />

      <span className="flex min-w-0 flex-1 flex-col justify-center">
        <Link
          href={`/uploads/${upload.id}`}
          className="row-link truncate text-sm font-medium"
        >
          {upload.originalName}
        </Link>
        <span className="text-muted-foreground truncate text-xs">
          <span className="font-mono">
            {upload.publicSlug}.{upload.extension}
          </span>{" "}
          · {uploadKindLabel(upload.kind, upload.contentType)} ·{" "}
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
      <span className="border-border bg-sunken h-10 w-10 shrink-0 rounded-lg border" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="bg-border block h-3.5 w-2/3 rounded" />
        <span className="bg-border block h-3 w-1/3 rounded" />
      </span>
      <span className="border-border h-11 w-20 shrink-0 rounded-lg border md:h-9" />
    </li>
  );
}
