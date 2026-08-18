import { panelSurface } from "./styles";

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
    <div className={`${panelSurface} px-4 py-10 text-center`}>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-muted-foreground mx-auto mt-1 max-w-prose text-sm">
        {body}
      </p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
