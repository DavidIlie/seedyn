import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "~/lib/utils";

/**
 * The one control shape.
 *
 * Cool ink surfaces, one-pixel rules, no decorative gradients. Blue is
 * functional: primary action, focus, and current location. The variants below
 * are the same four class strings `ui/styles.ts` used to export by hand — that
 * module now re-exports these so the whole application shares one definition.
 *
 * The 44px touch target collapses to 40px from `md` up, where a pointer is the
 * likely input device.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border text-sm font-medium " +
    "whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 " +
    "ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] motion-reduce:transform-none " +
    "disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-offset-2 " +
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** The one primary action per page. */
        default:
          "border-accent bg-accent text-accent-foreground hover:bg-accent/90",
        /** Everything else: bordered, on the panel surface, no fill. */
        outline:
          "border-border bg-panel text-foreground hover:border-border-strong hover:bg-sunken",
        /**
         * Destructive actions. `danger` is a state colour, not decoration: it
         * appears only on controls that permanently remove data.
         */
        destructive: "border-danger bg-panel text-danger hover:bg-danger/10",
        ghost:
          "border-transparent text-muted-foreground hover:border-border-strong hover:bg-sunken hover:text-foreground",
        link: "border-transparent text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 md:h-10",
        /** Small quiet control used inside rows and dense panels. */
        sm: "h-11 px-3 md:h-9",
        icon: "size-11 md:size-10",
        "icon-sm": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
