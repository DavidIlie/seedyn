"use client";

import * as React from "react";
import { type VariantProps } from "class-variance-authority";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";

import { toggleVariants } from "~/components/ui/toggle";
import { cn } from "~/lib/utils";

/**
 * A set of toggles that share one question.
 *
 * The generated shadcn group joins its items into a single bordered bar. This
 * application's switchers are inset instead — a sunken track with the selected
 * segment raised onto the panel — so `segmented` carries the track and the
 * items keep their own corners. Radix gives the group roving focus and
 * radiogroup semantics, which is what the `aria-pressed` buttons this replaces
 * were only approximating.
 */
const groupVariants = {
  default: "",
  outline: "",
  segmented: "border-border bg-sunken rounded-lg border p-0.5",
} as const;

function ToggleGroup({
  className,
  variant = "default",
  size,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  const context = React.useMemo(() => ({ variant, size }), [variant, size]);

  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      className={cn(
        "flex w-fit max-w-full items-center gap-0.5",
        groupVariants[variant ?? "default"],
        className,
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={context}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants>
>({ size: "default", variant: "default" });

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext);

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        toggleVariants({
          variant: context.variant ?? variant,
          size: context.size ?? size,
        }),
        "min-w-0 focus:z-10 focus-visible:z-10",
        className,
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem };
