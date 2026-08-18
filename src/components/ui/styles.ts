/**
 * Shared control styling.
 *
 * Two surfaces (`background`, `panel`), one-pixel borders, and no shadows or
 * gradients anywhere. Cyan (`accent`) appears in exactly three places across the
 * product: the primary action fill, the focus ring, and the active navigation
 * underline. Anything else that wants emphasis uses weight or a border.
 */

const CONTROL_BASE =
  "inline-flex items-center justify-center gap-2 rounded-md border text-sm font-medium " +
  "whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50";

/** The one primary action per page. */
export const buttonPrimary =
  `${CONTROL_BASE} h-11 border-accent bg-accent px-4 text-accent-foreground ` +
  "hover:bg-accent/90 md:h-10";

/** Everything else: bordered, on the panel surface, no fill. */
export const buttonQuiet =
  `${CONTROL_BASE} h-11 border-border bg-panel px-4 text-foreground ` +
  "hover:bg-foreground/5 md:h-10";

/** Small quiet control used inside rows and dense panels. */
export const buttonCompact = `${CONTROL_BASE} h-9 border-border bg-panel px-3 text-foreground hover:bg-foreground/5`;

/**
 * Destructive actions. `danger` is a state colour, not decoration: it appears
 * only on controls that permanently remove data and on a persisted
 * `DELETE_FAILED` lifecycle state.
 */
export const buttonDanger = `${CONTROL_BASE} h-11 border-danger bg-panel px-4 text-danger hover:bg-danger/10 md:h-10`;

export const inputBase =
  "h-11 w-full rounded-md border border-border bg-panel px-3 text-sm text-foreground " +
  "placeholder:text-muted-foreground md:h-10";

export const panelSurface = "rounded-md border border-border bg-panel";

export const labelBase = "text-sm font-medium text-foreground";

export const hintText = "text-sm text-muted-foreground";
