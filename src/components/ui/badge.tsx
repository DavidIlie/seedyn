import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "~/lib/utils";

/**
 * A small, quiet label for metadata that qualifies something else.
 *
 * The generated shadcn badge is a pill on `bg-primary`; this application reads
 * as cool ink on paper, so the badge keeps the `rounded-md` corner every other
 * surface uses and defaults to the bordered treatment. Blue stays functional:
 * `accent` is for a badge that reports the current state, never decoration.
 */
const badgeVariants = cva(
  "inline-flex w-fit max-w-full min-w-0 shrink-0 items-center justify-center gap-1 " +
    "rounded-md border px-1.5 py-0.5 text-[0.6875rem] leading-none font-medium " +
    "transition-colors [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        /** Metadata: present, legible, and visually subordinate to its row. */
        outline: "border-border bg-sunken text-muted-foreground",
        /** State the reader is meant to act on. */
        accent: "border-accent bg-accent text-accent-foreground",
        danger: "border-danger bg-panel text-danger",
      },
    },
    defaultVariants: {
      variant: "outline",
    },
  },
);

function Badge({
  className,
  variant = "outline",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
