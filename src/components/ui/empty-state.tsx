import { cardSurface } from "./card";

/**
 * Empty states carry the reason, never a generic shrug. A library with no
 * uploads and a search with no matches are different situations and get
 * different copy and different repair actions.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={`${cardSurface} bg-sunken/45 border-dashed px-6 py-14 text-center`}
    >
      <p className="font-display text-base font-semibold">{title}</p>
      <p className="text-muted-foreground mx-auto mt-2 max-w-[54ch] text-sm leading-6">
        {body}
      </p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
