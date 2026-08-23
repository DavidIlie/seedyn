"use client";

import { Button } from "~/components/ui/button";

import { TransferProgress } from "../transfer-progress";

/** Step two: one file, one measured bar, one way out. */
export function TransferStep({
  kind,
  label,
  loaded,
  total,
  onCancel,
}: {
  kind: "fetching" | "uploading";
  label: string;
  loaded: number;
  total: number | null;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="truncate text-sm font-medium" title={label}>
        {label}
      </p>
      <TransferProgress
        loaded={loaded}
        total={total}
        caption={kind === "fetching" ? "Fetching —" : "Uploading —"}
      />
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel transfer
      </Button>
    </div>
  );
}
