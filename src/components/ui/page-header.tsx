/**
 * One `h1` per page, one optional muted subtitle, and at most one action.
 *
 * The heading and the action are static and route-derived, so they land in the
 * instant shell. The subtitle is a slot rather than a string precisely so a page
 * can stream a real number into it instead of blocking the heading on a count.
 */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
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
      {action ? (
        <div className="w-full shrink-0 sm:w-auto">{action}</div>
      ) : null}
    </div>
  );
}
