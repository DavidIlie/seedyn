/**
 * Shared control styling.
 *
 * Cool ink surfaces, one-pixel rules, and no decorative gradients. Blue is
 * functional: primary action, focus, and current location. Everything else
 * gets hierarchy from typography, spacing, and neutral surface contrast.
 */

const CONTROL_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg border text-sm font-medium " +
  "whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 " +
  "ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] motion-reduce:transform-none " +
  "disabled:pointer-events-none disabled:opacity-50";

/** The one primary action per page. */
export const buttonPrimary =
  `${CONTROL_BASE} h-11 border-accent bg-accent px-4 text-accent-foreground ` +
  "hover:bg-accent/90 md:h-10";

/** Everything else: bordered, on the panel surface, no fill. */
export const buttonQuiet =
  `${CONTROL_BASE} h-11 border-border bg-panel px-4 text-foreground ` +
  "hover:border-border-strong hover:bg-sunken md:h-10";

/** Small quiet control used inside rows and dense panels. */
export const buttonCompact = `${CONTROL_BASE} h-11 border-border bg-panel px-3 text-foreground hover:border-border-strong hover:bg-sunken md:h-9`;

/**
 * Destructive actions. `danger` is a state colour, not decoration: it appears
 * only on controls that permanently remove data and on a persisted
 * `DELETE_FAILED` lifecycle state.
 */
export const buttonDanger = `${CONTROL_BASE} h-11 border-danger bg-panel px-4 text-danger hover:bg-danger/10 md:h-10`;

export const inputBase =
  "h-11 w-full rounded-lg border border-border bg-panel px-3 text-sm text-foreground " +
  "placeholder:text-muted-foreground md:h-10";

export const panelSurface =
  "overflow-hidden rounded-xl border border-border bg-panel";

export const labelBase =
  "block max-w-full text-sm font-medium text-foreground break-words";

export const hintText = "text-sm text-muted-foreground";
