"use client";

import { useEffect, useRef, useState } from "react";

/** Announce a determinate transfer this often, plus once on completion. */
const ANNOUNCE_EVERY_PERCENT = 10;

/**
 * A polite live region that a byte counter cannot flood.
 *
 * A progress caption changes on every `XMLHttpRequest` progress event —
 * potentially hundreds of times per transfer — and a live region bound directly
 * to it queues every one of those strings, which makes the surrounding dialog
 * unusable with a screen reader. The bar already carries the live value through
 * `role="progressbar"` and `aria-valuenow`, so this region speaks only the
 * coarse milestones.
 *
 * `label` must be the stable phrase — "Storing the GIF" — not the visible
 * caption, which usually embeds a byte count and therefore changes as often as
 * the progress events do. An indeterminate transfer has no milestones, so its
 * label is announced once when the phase begins and then stays quiet.
 */
export function ProgressAnnouncement({
  label,
  percent,
}: {
  label: string;
  percent: number | null;
}) {
  const [announced, setAnnounced] = useState("");
  const spoken = useRef<string | null>(null);

  useEffect(() => {
    const milestone =
      percent === null
        ? null
        : percent >= 100
          ? 100
          : Math.floor(percent / ANNOUNCE_EVERY_PERCENT) *
            ANNOUNCE_EVERY_PERCENT;
    const next = milestone === null ? label : `${label} ${milestone}%`;
    if (spoken.current === next) return;
    spoken.current = next;
    setAnnounced(next);
  }, [label, percent]);

  return (
    <span role="status" aria-live="polite" className="sr-only">
      {announced}
    </span>
  );
}
