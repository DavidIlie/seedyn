"use client";

import type * as React from "react";
import { useFormStatus } from "react-dom";

import { Button } from "~/components/ui/button";
import { useHydrated } from "~/components/ui/use-hydrated";

type ButtonVariant = React.ComponentProps<typeof Button>["variant"];

/**
 * Keep sensitive Server Actions inert until React can render their result.
 *
 * `pendingVariant` exists for destructive submits: a red button that has
 * already been pressed should stop reading as "press me", so it drops to the
 * quiet variant while the action is in flight.
 */
export function HydratedSubmitButton({
  label,
  pendingLabel,
  variant = "default",
  pendingVariant = variant,
  size,
  className,
}: {
  label: string;
  pendingLabel: string;
  variant?: ButtonVariant;
  pendingVariant?: ButtonVariant;
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const hydrated = useHydrated();
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={pending ? pendingVariant : variant}
      size={size}
      disabled={!hydrated || pending}
      className={className}
    >
      {pending ? pendingLabel : label}
    </Button>
  );
}
