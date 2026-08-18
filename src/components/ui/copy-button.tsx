"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Writes text to the system clipboard.
 *
 * This is a client boundary because `navigator.clipboard` is a browser
 * capability with no server equivalent — not because the surrounding row needs
 * interactivity. The button is permanently visible and fixed-width: a control
 * that appears on hover is unreachable by touch and shifts the row it lives in.
 */

type CopyState = "idle" | "copied" | "failed";

const RESET_MS = 1600;

const LABEL: Record<CopyState, string> = {
  idle: "Copy",
  copied: "Copied",
  failed: "Failed",
};

export function CopyButton({
  value,
  label,
  className = "",
}: {
  value: string;
  /** Accessible name, e.g. "Copy URL for screenshot.png". */
  label: string;
  className?: string;
}) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function copy() {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      // Clipboard access can be denied by permission or by an insecure origin.
      // Saying so is more useful than silently pretending the copy happened.
      setState("failed");
    }
    timer.current = setTimeout(() => setState("idle"), RESET_MS);
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label={label}
        data-state={state}
        className={
          "inline-flex h-11 w-20 shrink-0 items-center justify-center rounded-sm border md:h-9 " +
          "border-border bg-panel text-sm font-medium transition-[background-color,border-color,color,transform] duration-[120ms] " +
          "ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] motion-reduce:transform-none " +
          // The label change from "Copy" to "Copied" carries the state; the
          // border only reinforces it. Ember is not spent here — it is reserved
          // for the primary action, focus ring, active destination, and upload
          // URL rule, so it keeps a precise meaning.
          "hover:bg-foreground/5 data-[state=copied]:border-foreground " +
          "data-[state=failed]:border-danger data-[state=copied]:font-semibold " +
          "data-[state=failed]:text-danger " +
          className
        }
      >
        {LABEL[state]}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {state === "copied"
          ? `Copied ${value}`
          : state === "failed"
            ? "Copy failed. Select the URL and copy it manually."
            : ""}
      </span>
    </>
  );
}
