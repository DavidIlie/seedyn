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
    <div className="flex flex-wrap items-start justify-between gap-4 pt-8 pb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? (
          <div className="text-muted-foreground mt-1 text-sm">{subtitle}</div>
        ) : null}
      </div>
      {action ? <div className="hidden shrink-0 md:block">{action}</div> : null}
    </div>
  );
}
