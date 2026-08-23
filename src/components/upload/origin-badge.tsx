import { Badge } from "~/components/ui/badge";
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
  return `${origin} · ${credential.name}`;
}

export function UploadOriginBadge({
  provenance,
  className,
}: {
  provenance: SerializedUploadProvenance;
  className?: string;
}) {
  const label = uploadProvenanceLabel(provenance);
  return (
    <Badge title={label} className={className}>
      <span className="truncate">{label}</span>
    </Badge>
  );
}
