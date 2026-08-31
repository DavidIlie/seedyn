import Link from "next/link";
import { ChevronRight, ScrollText } from "lucide-react";

import { formatTimestamp } from "~/components/lib/format";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import type { AdminAuditPage } from "~/server/admin/audit";

export function AdminAuditLog({
  page,
  paged,
}: {
  page: AdminAuditPage;
  paged: boolean;
}) {
  return (
    <section
      aria-labelledby="audit-heading"
      className="border-border bg-panel overflow-hidden rounded-xl border"
    >
      <div className="border-border flex items-start gap-3 border-b px-4 py-4 sm:px-5">
        <span className="bg-brand text-brand-foreground grid size-9 shrink-0 place-items-center rounded-lg">
          <ScrollText aria-hidden="true" className="size-4" />
        </span>
        <div>
          <h2
            id="audit-heading"
            className="font-display text-base font-semibold"
          >
            Audit log
          </h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Machine API requests and security-sensitive user changes, newest
            first. Credentials and request bodies are never recorded.
          </p>
        </div>
      </div>

      {page.items.length === 0 ? (
        <div className="grid min-h-40 place-items-center px-6 text-center">
          <div>
            <p className="font-display text-sm font-semibold">
              No activity recorded yet
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              New API and account activity will appear here.
            </p>
          </div>
        </div>
      ) : (
        <div
          className="overflow-x-auto"
          role="region"
          aria-labelledby="audit-heading"
        >
          <table className="w-full min-w-[70rem] text-left text-sm">
            <caption className="sr-only">
              Administrative audit events, newest first.
            </caption>
            <thead className="bg-sunken/55 text-muted-foreground text-xs">
              <tr className="border-border border-b">
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Event</th>
                <th className="px-4 py-2.5 font-medium">Actor</th>
                <th className="px-4 py-2.5 font-medium">Request / target</th>
                <th className="px-4 py-2.5 text-right font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((event) => (
                <tr
                  key={event.id}
                  className="border-border border-b align-top last:border-b-0"
                >
                  <td className="text-muted-foreground px-4 py-3 text-xs whitespace-nowrap tabular-nums">
                    {formatTimestamp(event.occurredAt)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{humanize(event.action)}</p>
                    <Badge className="mt-1.5">{humanize(event.category)}</Badge>
                  </td>
                  <td className="max-w-56 px-4 py-3">
                    <p className="truncate font-medium">
                      {event.actor ?? humanize(event.actorType)}
                    </p>
                    {event.actor ? (
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {humanize(event.actorType)}
                      </p>
                    ) : null}
                  </td>
                  <td className="max-w-md px-4 py-3">
                    {event.route ? (
                      <code className="block truncate font-mono text-xs">
                        {event.method} {event.route}
                      </code>
                    ) : null}
                    {event.targetType ? (
                      <p className="text-muted-foreground mt-1 truncate text-xs">
                        {humanize(event.targetType)}
                        {event.targetId ? ` · ${event.targetId}` : ""}
                      </p>
                    ) : null}
                    {event.metadata ? (
                      <p className="text-muted-foreground mt-1 truncate font-mono text-[0.6875rem]">
                        {event.metadata}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Badge
                      variant={
                        event.outcome === "FAILURE" ||
                        event.outcome === "DENIED"
                          ? "danger"
                          : "outline"
                      }
                    >
                      {event.statusCode ? `${event.statusCode} · ` : ""}
                      {humanize(event.outcome)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {page.nextCursor || paged ? (
        <div className="border-border flex justify-end gap-2 border-t px-4 py-3">
          {paged ? (
            <Button asChild variant="outline">
              <Link href="/admin#audit-heading" scroll>
                Newest events
              </Link>
            </Button>
          ) : null}
          {page.nextCursor ? (
            <Button asChild variant="outline">
              <Link
                href={`/admin?auditCursor=${encodeURIComponent(page.nextCursor)}`}
                scroll={false}
              >
                Older events{" "}
                <ChevronRight aria-hidden="true" className="size-4" />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function humanize(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./u, (letter) => letter.toUpperCase());
}
