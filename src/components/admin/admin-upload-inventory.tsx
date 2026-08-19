"use client";

import {
  coreFeatures,
  createCoreRowModel,
  tableFeatures,
  useTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Images, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  formatBytes,
  formatTimestamp,
  uploadKindLabel,
} from "~/components/lib/format";
import { PreviewThumb } from "~/components/library/preview-thumb";
import { CopyButton } from "~/components/ui/copy-button";
import { buttonQuiet } from "~/components/ui/styles";
import { UploadOriginBadge } from "~/components/upload/origin-badge";
import type {
  AdminUploadFilters,
  AdminUploadPage,
  AdminUploadRow,
} from "~/server/admin/uploads";

const DEFAULT_FILTERS: AdminUploadFilters = {
  query: "",
  kind: "all",
  origin: "all",
};

const TABLE_FEATURES = tableFeatures({
  ...coreFeatures,
  coreRowModel: createCoreRowModel(),
});

const TABLE_COLUMNS = [
  { accessorKey: "upload.originalName", header: "Name" },
  { accessorKey: "owner.email", header: "Owner" },
  { accessorKey: "upload.kind", header: "Type" },
  { accessorKey: "upload.provenance", header: "Source" },
  { accessorKey: "upload.byteSize", header: "Size" },
  { accessorKey: "upload.createdAt", header: "Uploaded" },
] satisfies ColumnDef<typeof TABLE_FEATURES, AdminUploadRow>[];

async function fetchAdminUploads(input: {
  filters: AdminUploadFilters;
  cursor: string | null;
  signal: AbortSignal;
}): Promise<AdminUploadPage> {
  const params = new URLSearchParams();
  if (input.filters.query) params.set("q", input.filters.query);
  if (input.filters.kind !== "all") params.set("kind", input.filters.kind);
  if (input.filters.origin !== "all") {
    params.set("origin", input.filters.origin);
  }
  if (input.cursor) params.set("cursor", input.cursor);
  const response = await fetch(`/api/admin/uploads?${params}`, {
    headers: { Accept: "application/json" },
    signal: input.signal,
  });
  if (!response.ok)
    throw new Error(`Content listing failed (${response.status}).`);
  return (await response.json()) as AdminUploadPage;
}

export function AdminUploadInventory({
  initialPage,
}: {
  initialPage: AdminUploadPage;
}) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [draftQuery, setDraftQuery] = useState("");
  const [draftKind, setDraftKind] = useState<AdminUploadFilters["kind"]>("all");
  const [draftOrigin, setDraftOrigin] =
    useState<AdminUploadFilters["origin"]>("all");
  const sentinel = useRef<HTMLDivElement>(null);
  const defaultView =
    filters.query === "" && filters.kind === "all" && filters.origin === "all";
  const queryKey = useMemo(
    () => ["admin", "uploads", filters] as const,
    [filters],
  );
  const result = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      fetchAdminUploads({ filters, cursor: pageParam, signal }),
    initialPageParam: null as string | null,
    initialData: defaultView
      ? { pages: [initialPage], pageParams: [null] }
      : undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const items = result.data?.pages.flatMap((page) => page.items) ?? [];
  const columns = useMemo(() => TABLE_COLUMNS, []);
  const table = useTable({ features: TABLE_FEATURES, columns, data: items });

  useEffect(() => {
    const node = sentinel.current;
    if (
      !node ||
      !result.hasNextPage ||
      result.isFetchingNextPage ||
      result.isFetchNextPageError
    ) {
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void result.fetchNextPage();
      },
      { rootMargin: "360px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [result]);

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters({
      query: draftQuery.normalize("NFC").trim().slice(0, 100),
      kind: draftKind,
      origin: draftOrigin,
    });
  }

  function clearFilters() {
    setDraftQuery("");
    setDraftKind("all");
    setDraftOrigin("all");
    setFilters(DEFAULT_FILTERS);
  }

  return (
    <section
      aria-labelledby="content-heading"
      className="border-border bg-panel overflow-hidden rounded-xl border"
    >
      <div className="border-border flex flex-col gap-4 border-b px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="bg-brand text-brand-foreground grid size-9 shrink-0 place-items-center rounded-lg">
            <Images aria-hidden="true" className="size-4" />
          </span>
          <div>
            <h2
              id="content-heading"
              className="font-display text-base font-semibold"
            >
              Content
            </h2>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Preview every stored object and trace its owner and upload source.
            </p>
          </div>
        </div>
        <p
          className="text-muted-foreground text-sm tabular-nums"
          aria-live="polite"
        >
          {items.length.toLocaleString("en-US")} loaded
        </p>
      </div>

      <form
        onSubmit={applyFilters}
        className="border-border bg-sunken/45 grid gap-2 border-b p-3 sm:grid-cols-[minmax(12rem,1fr)_auto_auto_auto] sm:px-4"
      >
        <label className="relative min-w-0">
          <span className="sr-only">Search uploaded content</span>
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <input
            type="search"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="Name, slug, or owner"
            className="border-border bg-panel placeholder:text-muted-foreground/80 focus:border-accent h-11 w-full rounded-lg border pr-3 pl-9 text-sm outline-none"
          />
        </label>
        <label>
          <span className="sr-only">Media type</span>
          <select
            value={draftKind}
            onChange={(event) =>
              setDraftKind(event.target.value as AdminUploadFilters["kind"])
            }
            className="border-border bg-panel h-11 w-full rounded-lg border px-3 text-sm"
          >
            <option value="all">All types</option>
            <option value="IMAGE">Images</option>
            <option value="VIDEO">Videos</option>
            <option value="FILE">Files</option>
            <option value="TEXT">Text</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Upload source</span>
          <select
            value={draftOrigin}
            onChange={(event) =>
              setDraftOrigin(event.target.value as AdminUploadFilters["origin"])
            }
            className="border-border bg-panel h-11 w-full rounded-lg border px-3 text-sm"
          >
            <option value="all">All sources</option>
            <option value="BROWSER">Browser</option>
            <option value="HTTP">HTTP API</option>
            <option value="SHAREX">ShareX</option>
            <option value="S3">S3</option>
            <option value="LEGACY_UNKNOWN">Legacy</option>
          </select>
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            className="bg-brand text-brand-foreground hover:bg-accent h-11 flex-1 rounded-lg px-3 text-sm font-semibold transition-colors"
          >
            Filter
          </button>
          {!defaultView ? (
            <button
              type="button"
              onClick={clearFilters}
              aria-label="Clear content filters"
              className="border-border bg-panel text-muted-foreground hover:text-foreground grid size-11 place-items-center rounded-lg border"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </div>
      </form>

      {result.isPending ? (
        <div className="grid h-48 place-items-center text-sm">
          Loading content…
        </div>
      ) : result.isError ? (
        <div className="grid h-48 place-items-center px-6 text-center">
          <div>
            <p className="font-semibold">Content could not be loaded</p>
            <button
              type="button"
              onClick={() => void result.refetch()}
              className={`${buttonQuiet} mt-3`}
            >
              Try again
            </button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="grid h-48 place-items-center px-6 text-center">
          <div>
            <p className="font-display text-sm font-semibold">
              No matching content
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              Clear a filter or search for another object.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[68rem] text-left text-sm">
              <caption className="sr-only">
                Uploaded content loaded incrementally, newest first.
              </caption>
              <thead className="bg-sunken/55 text-muted-foreground text-xs">
                <tr className="border-border border-b">
                  <th className="w-16 px-3 py-2.5 font-medium">Preview</th>
                  <th className="px-3 py-2.5 font-medium">Name</th>
                  <th className="px-3 py-2.5 font-medium">Owner</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 font-medium">Source</th>
                  <th className="px-3 py-2.5 text-right font-medium">Size</th>
                  <th className="px-3 py-2.5 text-right font-medium">
                    Uploaded
                  </th>
                  <th className="w-16 px-3 py-2.5 text-right font-medium">
                    URL
                  </th>
                </tr>
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <UploadTableRow key={row.id} row={row.original} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-border divide-y md:hidden">
            {items.map((row) => (
              <UploadCard key={row.upload.id} row={row} />
            ))}
          </div>
        </>
      )}

      <div className="border-border flex flex-col items-center gap-2 border-t px-4 py-4">
        <div ref={sentinel} aria-hidden="true" className="h-px w-full" />
        {result.hasNextPage ? (
          <button
            type="button"
            className={buttonQuiet}
            disabled={result.isFetchingNextPage}
            onClick={() => void result.fetchNextPage()}
          >
            {result.isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        ) : items.length > 0 ? (
          <p className="text-muted-foreground text-xs">End of content</p>
        ) : null}
        {result.isFetchNextPageError ? (
          <p role="alert" className="text-danger text-sm">
            More content could not be loaded. Select Load more to retry.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function UploadTableRow({ row }: { row: AdminUploadRow }) {
  const { upload, owner, url } = row;
  return (
    <tr className="border-border hover:bg-sunken/45 border-b transition-colors last:border-b-0">
      <td className="px-3 py-2.5">
        <PreviewThumb upload={upload} url={url} />
      </td>
      <td className="max-w-72 px-3 py-2.5">
        <Link
          href={`/uploads/${upload.id}`}
          className="hover:text-accent block truncate font-medium"
        >
          {upload.originalName}
        </Link>
        <code className="text-muted-foreground block truncate font-mono text-[0.6875rem]">
          {upload.publicSlug}.{upload.extension}
        </code>
      </td>
      <td className="max-w-48 px-3 py-2.5">
        <p className="truncate text-xs font-medium">
          {owner.name ?? owner.email ?? "Unknown"}
        </p>
        {owner.name && owner.email ? (
          <p className="text-muted-foreground truncate text-[0.6875rem]">
            {owner.email}
          </p>
        ) : null}
      </td>
      <td className="text-muted-foreground px-3 py-2.5 text-xs">
        {uploadKindLabel(upload.kind, upload.contentType)}
      </td>
      <td className="max-w-52 px-3 py-2.5">
        <UploadOriginBadge provenance={upload.provenance} />
      </td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums">
        {formatBytes(upload.byteSize)}
      </td>
      <td className="text-muted-foreground px-3 py-2.5 text-right text-xs tabular-nums">
        {formatTimestamp(upload.createdAt)}
      </td>
      <td className="px-3 py-2.5 text-right">
        <CopyButton value={url} label={`Copy URL for ${upload.originalName}`} />
      </td>
    </tr>
  );
}

function UploadCard({ row }: { row: AdminUploadRow }) {
  const { upload, owner, url } = row;
  return (
    <article className="p-4">
      <div className="flex items-start gap-3">
        <PreviewThumb upload={upload} url={url} className="size-12" />
        <div className="min-w-0 flex-1">
          <Link
            href={`/uploads/${upload.id}`}
            className="block truncate text-sm font-semibold"
          >
            {upload.originalName}
          </Link>
          <code className="text-muted-foreground block truncate font-mono text-[0.6875rem]">
            {upload.publicSlug}.{upload.extension}
          </code>
          <p className="text-muted-foreground mt-1 truncate text-xs">
            {owner.name ?? owner.email ?? "Unknown owner"} ·{" "}
            {formatBytes(upload.byteSize)} · {formatTimestamp(upload.createdAt)}
          </p>
          <UploadOriginBadge provenance={upload.provenance} className="mt-2" />
        </div>
        <CopyButton value={url} label={`Copy URL for ${upload.originalName}`} />
      </div>
    </article>
  );
}
