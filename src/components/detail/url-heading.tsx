import { CopyButton } from "~/components/ui/copy-button";

/**
 * The canonical URL is the page's `h1`.
 *
 * On a page about one uploaded file, the URL is the thing the user came for and
 * the filename is metadata about it — so the URL gets the heading and the
 * filename is subordinate. It is never truncated: an ellipsis in the middle of
 * a slug turns a copyable identifier into a picture of one.
 *
 * The scheme is muted and the path is strengthened purely with colour and
 * weight. The spans are contiguous text, so selecting the heading — which one
 * click does — yields the exact URL, and Copy sends the same string.
 */
export function UrlHeading({ url }: { url: string }) {
  const parsed = new URL(url);

  return (
    <div className="border-border flex flex-wrap items-center gap-3 rounded-md border p-3">
      <h1 className="min-w-0 flex-1 font-mono text-xl leading-snug break-all select-all md:text-2xl">
        <span className="text-muted-foreground font-normal">
          {parsed.protocol}
          {"//"}
        </span>
        <span className="font-normal">{parsed.host}</span>
        <span className="font-medium">{parsed.pathname}</span>
      </h1>
      <CopyButton value={url} label="Copy this upload's URL" />
    </div>
  );
}

/** The heading frame at its resolved height while the record is in flight. */
export function UrlHeadingSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="border-border flex items-center gap-3 rounded-md border p-3"
    >
      <div className="bg-border h-7 flex-1 rounded md:h-8" />
      <div className="border-border h-9 w-20 shrink-0 rounded-md border" />
    </div>
  );
}
