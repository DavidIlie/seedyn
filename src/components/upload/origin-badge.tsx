import type {
  SerializedUploadOrigin,
  SerializedUploadProvenance,
} from "~/server/uploads/serialization";

const ORIGIN_LABEL: Record<SerializedUploadOrigin, string> = {
  LEGACY_UNKNOWN: "Legacy",
  BROWSER: "Browser",
  HTTP: "HTTP API",
  SHAREX: "ShareX",
  S3: "S3",
};

export function uploadOriginLabel(origin: SerializedUploadOrigin): string {
  return ORIGIN_LABEL[origin];
}

export function uploadProvenanceLabel(
  provenance: SerializedUploadProvenance,
): string {
  const origin = uploadOriginLabel(provenance.origin);
  const credential = provenance.credential;
  if (!credential) return origin;
  return credential.clientLabel
    ? `${origin} · ${credential.name} — ${credential.clientLabel}`
    : `${origin} · ${credential.name}`;
}

export function UploadOriginBadge({
  provenance,
  className = "",
}: {
  provenance: SerializedUploadProvenance;
  className?: string;
}) {
  const label = uploadProvenanceLabel(provenance);
  return (
    <span
      title={label}
      className={`border-border bg-sunken text-muted-foreground inline-flex max-w-full min-w-0 items-center rounded-md border px-1.5 py-0.5 text-[0.6875rem] leading-none font-medium ${className}`}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}
