import {
  formatBytes,
  formatDimensions,
  formatDuration,
  formatTimestamp,
  lifecycleLabel,
  uploadKindLabel,
} from "~/components/lib/format";
import type { SerializedUpload } from "~/server/uploads/serialization";
import { uploadOriginLabel } from "~/components/upload/origin-badge";

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
      term: "Uploaded via",
      value: uploadOriginLabel(upload.provenance.origin),
    },
    ...(upload.provenance.credential
      ? [
          {
            term: "Credential",
            value: (
              <>
                {upload.provenance.credential.name}{" "}
                <code className="text-muted-foreground font-mono text-xs">
                  {upload.provenance.credential.slug}
                </code>
              </>
            ),
          },
        ]
      : []),
    ...(upload.provenance.s3
      ? [{ term: "S3 object key", value: upload.provenance.s3.objectKey }]
      : []),
    {
      term: "Access",
      value: upload.passwordProtected
        ? "Password required"
        : "Anyone with the link",
    },
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
    <dl className="border-border border-y">
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
    <div aria-hidden="true" className="border-border border-y">
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
