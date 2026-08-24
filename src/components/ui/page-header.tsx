import { RefreshButton } from "~/components/data/refresh";

/**
 * One `h1` per page, one optional muted subtitle, and at most one action.
 *
 * The heading and the action are static and route-derived, so they land in the
 * instant shell. The subtitle is a slot rather than a string precisely so a page
 * can stream a real number into it instead of blocking the heading on a count.
 *
 * Every header also carries a refresh control. It sits before the page action
 * so the primary affordance keeps the trailing edge, and it is opt-out rather
 * than opt-in so a new page cannot quietly ship without one.
 */
export function PageHeader({
  title,
  subtitle,
  action,
  refreshable = true,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  /** Set false on a page whose content cannot go stale behind the reader. */
  refreshable?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 pt-10 pb-7">
      <div className="min-w-0">
        <h1 className="font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.025em]">
          {title}
        </h1>
        {subtitle ? (
          <div className="text-muted-foreground mt-1 text-sm">{subtitle}</div>
        ) : null}
      </div>
      {refreshable || action ? (
        <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
          {refreshable ? <RefreshButton /> : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}
