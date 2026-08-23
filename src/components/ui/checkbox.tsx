"use client";

import * as React from "react";
import { CheckIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";

import { cn } from "~/lib/utils";

/**
 * A checkbox that participates in plain form submission.
 *
 * Radix renders a real hidden `<input type="checkbox">` whenever `name` is
 * supplied, so a Server Action form keeps receiving the field it expects. The
 * focus treatment matches `ui/input.tsx` and `ui/button.tsx` — a shifted
 * outline rather than a ring, so the three controls agree when stacked.
 */
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "border-border-strong bg-panel data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground aria-invalid:border-danger peer grid size-4 shrink-0 place-content-center rounded-[4px] border transition-colors focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current"
      >
        <CheckIcon className="size-3" aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
