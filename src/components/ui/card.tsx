import * as React from "react";

import { cn } from "~/lib/utils";

/**
 * The one panel surface: a hairline rule around the raised paper colour.
 *
 * Exported as a class string as well as a component because several of these
 * panels are semantically a `<ul>` or a `<section>`, and a list of rows should
 * stay a list rather than becoming a `<div>` to satisfy a primitive. `overflow-hidden`
 * is part of the token: every one of these surfaces clips rows to its corners.
 *
 * Deliberately unopinionated about padding — the panels in this application
 * are row containers with their own internal rules, not evenly padded cards.
 */
export const cardSurface =
  "overflow-hidden rounded-xl border border-border bg-panel";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card" className={cn(cardSurface, className)} {...props} />
  );
}

export { Card };
