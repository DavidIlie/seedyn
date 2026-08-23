"use client";

import { Pause, Play, WifiOff } from "lucide-react";

import { formatBytes } from "~/components/lib/format";
import { Button } from "~/components/ui/button";

import { TransferProgress } from "../transfer-progress";
import type { TransferPhase } from "../use-upload-transfer";

/**
 * Step two: one file, one measured bar, one way out.
 *
 * A large file travels as a resumable multipart session, so this step also
 * carries the two controls that only make sense there — hold it, pick it up
 * again — and says plainly when the connection dropped, because completed
 * parts survive that and nothing here should imply otherwise. Once every byte
 * is in storage there is nothing left to cancel, so the button goes away
 * rather than lying about what it would do.
 */
export function TransferStep({
  phase,
  pausable,
  onPauseResume,
  onCancel,
}: {
  phase: Extract<
    TransferPhase,
    {
      name:
        | "fetching"
        | "preparing"
        | "uploading"
        | "paused"
        | "offline"
        | "verifying";
    }
  >;
  pausable: boolean;
  onPauseResume: () => void;
  onCancel: () => void;
}) {
  const measured = phase.name === "preparing" ? null : phase;
  const paused = phase.name === "paused";

  return (
    <div className="space-y-4">
      <p className="truncate text-sm font-medium" title={phase.label}>
        {phase.label}
      </p>
      <TransferProgress
        loaded={measured?.loaded ?? 0}
        total={measured ? measured.total : null}
        caption={caption(phase)}
      />
      {phase.name === "offline" ? (
        <p
          role="alert"
          className="border-danger/40 bg-danger/5 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
        >
          <WifiOff className="size-4 shrink-0" aria-hidden="true" />
          Connection lost. The parts already sent are safe, and the transfer
          resumes when the browser reconnects.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {pausable && (phase.name === "uploading" || paused) ? (
          <Button type="button" variant="outline" onClick={onPauseResume}>
            {paused ? (
              <Play className="size-4" aria-hidden="true" />
            ) : (
              <Pause className="size-4" aria-hidden="true" />
            )}
            {paused ? "Resume upload" : "Pause upload"}
          </Button>
        ) : null}
        {phase.name === "verifying" ? null : (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel transfer
          </Button>
        )}
      </div>
    </div>
  );
}

function caption(phase: TransferPhase): string {
  switch (phase.name) {
    case "fetching":
      return "Fetching —";
    case "preparing":
      return "Preparing — checking the file on this device";
    case "verifying":
      return "Verifying — every byte is sent, the server is confirming it";
    case "paused":
      return `Paused — ${formatBytes(phase.loaded)} of ${formatBytes(phase.total)} uploaded. Progress is kept while this dialog stays open.`;
    case "offline":
      return `Connection lost — ${formatBytes(phase.loaded)} of ${formatBytes(phase.total)} kept. Reconnecting…`;
    default:
      return "Uploading —";
  }
}
