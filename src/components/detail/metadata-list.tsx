import {
  formatBytes,
  formatDimensions,
  formatDuration,
  formatTimestamp,
  lifecycleLabel,
  uploadKindLabel,
} from "~/components/lib/format";
import type { SerializedUpload } from "~/server/uploads/serialization";

/**
 * Metadata as a description list, because that is what it is: a set of
 * term/value pairs. Rows that have no value are omitted rather than padded with
 * an em dash, and the lifecycle row appears only when the record is not in its
 * resting `READY` state.
 */
export function MetadataList({ upload }: { upload: SerializedUpload }) {
  const lifecycle = lifecycleLabel(upload.state);
  const dimensions = formatDimensions(upload.width, upload.height);
  const duration = formatDuration(upload.durationMs);

  const rows: { term: string; value: React.ReactNode }[] = [
    { term: "Filename", value: upload.originalName },
    {
      term: "Type",
      value: `${uploadKindLabel(upload.kind, upload.contentType)} · ${upload.contentType}`,
    },
    { term: "Size", value: formatBytes(upload.byteSize) },
    ...(dimensions ? [{ term: "Dimensions", value: dimensions }] : []),
    ...(duration ? [{ term: "Duration", value: duration }] : []),
    { term: "Uploaded", value: formatTimestamp(upload.createdAt) },
    {
      term: "Served as",
      value:
        upload.disposition === "INLINE"
          ? "Inline in the browser"
          : "Download (attachment)",
    },
    ...(lifecycle
      ? [
          {
            term: "State",
            value: (
              <span
                className={
                  upload.state === "DELETE_FAILED" ? "text-danger" : ""
                }
              >
                {lifecycle}
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    <dl className="border-border rounded-md border">
      {rows.map((row, index) => (
        <div
          key={row.term}
          className={
            "flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-sm " +
            (index === 0 ? "" : "border-border border-t")
          }
        >
          <dt className="text-muted-foreground w-28 shrink-0">{row.term}</dt>
          <dd className="min-w-0 flex-1 break-words">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function MetadataListSkeleton() {
  return (
    <div aria-hidden="true" className="border-border rounded-md border">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className={
            "flex gap-4 px-4 py-3 " +
            (index === 0 ? "" : "border-border border-t")
          }
        >
          <div className="bg-border h-4 w-28 shrink-0 rounded" />
          <div className="bg-border h-4 flex-1 rounded" />
        </div>
      ))}
    </div>
  );
}
