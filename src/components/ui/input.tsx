import * as React from "react";

import { cn } from "~/lib/utils";

/**
 * Note the absence of `outline-none`: `globals.css` puts a 2px accent ring on
 * every `:focus-visible`, and a Tailwind utility would override that base-layer
 * rule and leave a 1px border tint as the only focus indicator. The border
 * colour change is an addition to that ring, not a replacement for it.
 */
export const inputVariants =
  "h-11 w-full rounded-lg border border-border bg-panel px-3 text-sm text-foreground " +
  "placeholder:text-muted-foreground transition-colors " +
  "hover:border-border-strong focus:border-accent focus-visible:outline-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-60 " +
  "aria-invalid:border-danger md:h-10";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputVariants, className)}
      {...props}
    />
  );
}

export { Input };
