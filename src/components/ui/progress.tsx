"use client";

import * as React from "react";
import { Progress as ProgressPrimitive } from "radix-ui";

import { cn } from "~/lib/utils";

/**
 * A measured bar, or no bar at all.
 *
 * Passing `value={null}` puts Radix into its indeterminate state, and this
 * component then draws nothing rather than an animation that implies progress
 * nobody measured. Seedyn never renders synthetic progress.
 */
function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn(
        "border-border bg-background relative h-2 w-full overflow-hidden rounded-full border",
        className,
      )}
      {...props}
    >
      {typeof value === "number" ? (
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className="bg-accent h-full w-full flex-1 transition-transform duration-[120ms] ease-out"
          style={{ transform: `translateX(-${100 - value}%)` }}
        />
      ) : null}
    </ProgressPrimitive.Root>
  );
}

export { Progress };
