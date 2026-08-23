/**
 * Compatibility aliases for the class-string design system.
 *
 * The definitions moved into real primitives — `ui/button.tsx`,
 * `ui/input.tsx`, `ui/label.tsx` — so a control has one source of truth and can
 * carry variants instead of being pasted together from strings. These exports
 * are the same strings those primitives emit and exist so files that have not
 * migrated yet keep rendering identically. Prefer `<Button>`, `<Input>` and
 * `<Label>` in new code.
 */

import { buttonVariants } from "./button";
import { inputVariants } from "./input";

/** The one primary action per page. */
export const buttonPrimary = buttonVariants({ variant: "default" });

/** Everything else: bordered, on the panel surface, no fill. */
export const buttonQuiet = buttonVariants({ variant: "outline" });

/** Small quiet control used inside rows and dense panels. */
export const buttonCompact = buttonVariants({ variant: "outline", size: "sm" });

/**
 * Destructive actions. `danger` is a state colour, not decoration: it appears
 * only on controls that permanently remove data and on a persisted
 * `DELETE_FAILED` lifecycle state.
 */
export const buttonDanger = buttonVariants({ variant: "destructive" });

export const inputBase = inputVariants;

export const panelSurface =
  "overflow-hidden rounded-xl border border-border bg-panel";

/** Consumed by `ui/label.tsx`; kept here because that module is client-only. */
export const labelBase =
  "block max-w-full text-sm font-medium text-foreground break-words";

export const hintText = "text-sm text-muted-foreground";
