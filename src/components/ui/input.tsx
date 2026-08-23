import * as React from "react";

import { cn } from "~/lib/utils";

export const inputVariants =
  "h-11 w-full rounded-lg border border-border bg-panel px-3 text-sm text-foreground " +
  "placeholder:text-muted-foreground transition-colors outline-none " +
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
