"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Toggle as TogglePrimitive } from "radix-ui";

import { cn } from "~/lib/utils";

/**
 * A control that is either on or off and says so.
 *
 * Retuned from the generated shadcn toggle onto this application's tokens.
 * The `segmented` variant is the inset switcher two surfaces had hand-rolled
 * out of `aria-pressed` buttons: the group is a sunken track and the selected
 * segment lifts onto the panel, tinted accent because accent marks the current
 * location.
 */
const toggleVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium " +
    "whitespace-nowrap transition-colors focus-visible:outline-offset-2 " +
    "disabled:pointer-events-none disabled:opacity-50 " +
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-transparent text-muted-foreground hover:text-foreground " +
          "data-[state=on]:bg-sunken data-[state=on]:text-foreground",
        outline:
          "border border-border bg-panel text-foreground hover:border-border-strong " +
          "hover:bg-sunken data-[state=on]:border-accent data-[state=on]:text-accent",
        segmented:
          "border border-transparent text-muted-foreground hover:text-foreground " +
          "data-[state=on]:bg-panel data-[state=on]:text-accent data-[state=on]:shadow-sm",
      },
      size: {
        default: "h-10 px-3",
        sm: "h-9 px-2.5 text-xs",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
