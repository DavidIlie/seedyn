"use client";

import { formatBytes } from "~/components/lib/format";
import { Progress } from "~/components/ui/progress";

/** Announce at most this often, plus once when the transfer reaches 100%. */
const ANNOUNCE_EVERY_PERCENT = 10;

/**
 * A measured byte transfer.
 *
 * `total` is null while the browser cannot compute a length; the bar then
 * reports itself as indeterminate and draws nothing rather than animating
 * progress nobody measured.
 *
 * The visible caption repaints on every `XMLHttpRequest` progress event —
 * potentially hundreds of times — so it is deliberately not the live region. A
 * separate region speaks coarse milestones instead, which is the difference
 * between a usable dialog and a screen reader reading out a byte counter.
 */
export function TransferProgress({
  loaded,
  total,
  caption,
}: {
  loaded: number;
  total: number | null;
  caption: string;
}) {
  const value =
    total === null || total <= 0
      ? null
      : Math.min(100, Math.round((loaded / total) * 100));
  const milestone =
    value === null
      ? null
      : value >= 100
        ? 100
        : Math.floor(value / ANNOUNCE_EVERY_PERCENT) * ANNOUNCE_EVERY_PERCENT;

  return (
    <div>
      <Progress value={value} aria-label={caption} />
      <span role="status" aria-live="polite" className="sr-only">
        {milestone === null ? caption : `${caption} ${milestone}%`}
      </span>
      <p aria-hidden="true" className="text-muted-foreground mt-2 text-sm">
        {caption}{" "}
        {value === null
          ? `${formatBytes(loaded)} transferred`
          : `${value}% · ${formatBytes(loaded)} of ${formatBytes(total ?? 0)}`}
      </p>
    </div>
  );
}
