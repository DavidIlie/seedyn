"use client";

import { Upload } from "lucide-react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

import { useUploadDialog } from "./upload-context";

/**
 * The one upload trigger, parameterised per page.
 *
 * `/images` says "Upload image" and narrows the file picker to images;
 * `/files` says "Upload file". `accept` is a convenience for the operating
 * system picker and nothing more — the server always classifies the bytes it
 * receives, so a mis-picked file is stored as whatever it actually is rather
 * than rejected.
 */
export function UploadAction({
  className,
  label = "Upload",
  accept,
  variant = "default",
  compactOnNarrow = false,
}: {
  className?: string;
  label?: string;
  accept?: string;
  variant?: "default" | "outline";
  compactOnNarrow?: boolean;
}) {
  const openDialog = useUploadDialog();

  return (
    <Button
      type="button"
      variant={variant}
      onClick={() => openDialog({ accept })}
      className={cn(
        compactOnNarrow && "max-[390px]:size-11 max-[390px]:px-0",
        className,
      )}
    >
      <Upload className="size-4" aria-hidden="true" />
      <span className={compactOnNarrow ? "max-[390px]:sr-only" : undefined}>
        {label}
      </span>
    </Button>
  );
}
