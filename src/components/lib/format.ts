/**
 * Presentation helpers shared by Server Components and browser islands.
 *
 * Every value here is deterministic and locale-neutral. Relative timestamps
 * ("2 minutes ago") are deliberately absent: they depend on the reading clock,
 * so a server-rendered relative string and its first client render disagree,
 * and the disagreement grows with streaming and back-navigation restores.
 */

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatBytes(byteSize: string | number | bigint): string {
  const bytes = Number(byteSize);
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1000) return `${bytes} B`;

  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < BYTE_UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${BYTE_UNITS[unit]}`;
}

const TIMESTAMP_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** `2026-08-17 14:32 UTC` — identical on the server and in every browser. */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = TIMESTAMP_FORMAT.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")} UTC`;
}

export function formatDimensions(
  width: number | null,
  height: number | null,
): string | null {
  return width && height ? `${width}×${height}` : null;
}

export function formatDuration(durationMs: number | null): string | null {
  if (!durationMs || durationMs <= 0) return null;
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export type UploadKindValue = "IMAGE" | "VIDEO" | "TEXT" | "FILE";

export function uploadKindLabel(kind: string, contentType: string): string {
  switch (kind) {
    case "IMAGE":
      return `${contentType.replace("image/", "").toUpperCase()} image`;
    case "VIDEO":
      return `${contentType.replace("video/", "").toUpperCase()} video`;
    case "TEXT":
      return "Text";
    default:
      return "File";
  }
}

/**
 * A stable three-character glyph per upload kind. Type glyphs never change with
 * load state, so a broken or still-loading preview keeps the row's geometry and
 * the row never collapses.
 */
export function uploadKindGlyph(kind: string): string {
  switch (kind) {
    case "IMAGE":
      return "IMG";
    case "VIDEO":
      return "VID";
    case "TEXT":
      return "TXT";
    default:
      return "BIN";
  }
}

/** `READY` is the resting state and is never decorated. */
export function lifecycleLabel(state: string): string | null {
  switch (state) {
    case "DELETING":
      return "Deleting";
    case "DELETE_FAILED":
      return "Delete failed";
    default:
      return null;
  }
}
