/**
 * Exact geometry of the request-time account trigger. The signed-in identity
 * streams into this slot without moving the upload action or primary nav.
 */
export function AccountMenuPlaceholder() {
  return (
    <span
      aria-hidden="true"
      className="border-border bg-panel grid size-11 shrink-0 place-items-center rounded-lg border lg:size-10"
    >
      <span className="bg-border size-7 rounded-full" />
    </span>
  );
}
