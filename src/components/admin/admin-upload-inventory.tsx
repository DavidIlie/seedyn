"use client";

import {
  coreFeatures,
  createCoreRowModel,
  tableFeatures,
  useTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Images, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  formatBytes,
  formatTimestamp,
  uploadKindLabel,
} from "~/components/lib/format";
import { PreviewThumb } from "~/components/library/preview-thumb";
import { Button } from "~/components/ui/button";
import { CopyButton } from "~/components/ui/copy-button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { UploadOriginBadge } from "~/components/upload/origin-badge";
import type {
  AdminUploadFilters,
  AdminUploadPage,
  AdminUploadRow,
} from "~/server/admin/uploads";

import { AdminUploadPreview } from "./admin-upload-preview";

const DEFAULT_FILTERS: AdminUploadFilters = {
  query: "",
  kind: "all",
  origin: "all",
};

type KindFilter = AdminUploadFilters["kind"];
type OriginFilter = AdminUploadFilters["origin"];

const KIND_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "IMAGE", label: "Images" },
  { value: "VIDEO", label: "Videos" },
  { value: "FILE", label: "Files" },
  { value: "TEXT", label: "Text" },
] as const satisfies readonly { value: KindFilter; label: string }[];

const ORIGIN_OPTIONS = [
  { value: "all", label: "All sources" },
  { value: "BROWSER", label: "Browser" },
  { value: "HTTP", label: "HTTP API" },
  { value: "SHAREX", label: "ShareX" },
  { value: "S3", label: "S3" },
  { value: "LEGACY_UNKNOWN", label: "Legacy" },
] as const satisfies readonly { value: OriginFilter; label: string }[];

/**
 * The listbox hands back a bare string, so the union is re-established by
 * checking the option table rather than asserting the type away. An unknown
 * value falls back to the unfiltered view instead of reaching the query.
 */
function narrowKind(value: string): KindFilter {
  return KIND_OPTIONS.find((option) => option.value === value)?.value ?? "all";
}

function narrowOrigin(value: string): OriginFilter {
  return (
    ORIGIN_OPTIONS.find((option) => option.value === value)?.value ?? "all"
  );
}

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
  const queryClient = useQueryClient();
  const router = useRouter();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [draftQuery, setDraftQuery] = useState("");
  const [draftKind, setDraftKind] = useState<AdminUploadFilters["kind"]>("all");
  const [draftOrigin, setDraftOrigin] =
    useState<AdminUploadFilters["origin"]>("all");
  const [selected, setSelected] = useState<AdminUploadRow | null>(null);
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null]);
  const cursor = cursorHistory.at(-1) ?? null;
  const defaultView =
    filters.query === "" && filters.kind === "all" && filters.origin === "all";
  const queryKey = useMemo(
    () => ["admin", "uploads", filters, cursor] as const,
    [cursor, filters],
  );
  const result = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchAdminUploads({ filters, cursor, signal }),
    initialData: defaultView && cursor === null ? initialPage : undefined,
  });
  const items = result.data?.items ?? [];
  const columns = useMemo(() => TABLE_COLUMNS, []);
  const table = useTable({ features: TABLE_FEATURES, columns, data: items });

  useEffect(() => {
    const refreshContent = () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "uploads"] });
    };
    window.addEventListener("seedyn:admin-uploads-changed", refreshContent);
    return () =>
      window.removeEventListener(
        "seedyn:admin-uploads-changed",
        refreshContent,
      );
  }, [queryClient]);

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters({
      query: draftQuery.normalize("NFC").trim().slice(0, 100),
      kind: draftKind,
      origin: draftOrigin,
    });
    setCursorHistory([null]);
  }

  function clearFilters() {
    setDraftQuery("");
    setDraftKind("all");
    setDraftOrigin("all");
    setFilters(DEFAULT_FILTERS);
    setCursorHistory([null]);
  }

  function uploadDeleted() {
    setSelected(null);
    void queryClient.invalidateQueries({ queryKey: ["admin", "uploads"] });
    router.refresh();
  }

  return (
    <>
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
                Preview every stored object and trace its owner and upload
                source.
              </p>
            </div>
          </div>
          <p
            className="text-muted-foreground text-sm tabular-nums"
            aria-live="polite"
          >
            Page {cursorHistory.length} · {items.length.toLocaleString("en-US")}{" "}
            rows
          </p>
        </div>

        <form
          onSubmit={applyFilters}
          className="border-border bg-sunken/45 grid gap-2 border-b p-3 sm:grid-cols-[minmax(12rem,1fr)_auto_auto_auto] sm:px-4"
        >
          <div className="relative min-w-0">
            <Label htmlFor="admin-content-query" className="sr-only">
              Search uploaded content
            </Label>
            <Search
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <Input
              id="admin-content-query"
              type="search"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder="Name, slug, or owner"
              className="pr-3 pl-9"
            />
          </div>
          <Select
            value={draftKind}
            onValueChange={(next) => setDraftKind(narrowKind(next))}
          >
            <SelectTrigger aria-label="Media type" className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={draftOrigin}
            onValueChange={(next) => setDraftOrigin(narrowOrigin(next))}
          >
            <SelectTrigger aria-label="Upload source" className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORIGIN_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button
              type="submit"
              className="border-brand bg-brand text-brand-foreground hover:bg-accent flex-1 px-3 font-semibold"
            >
              Filter
            </Button>
            {!defaultView ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={clearFilters}
                aria-label="Clear content filters"
                className="text-muted-foreground hover:text-foreground"
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
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
              <Button
                type="button"
                variant="outline"
                onClick={() => void result.refetch()}
                className="mt-3"
              >
                Try again
              </Button>
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
                  Uploaded content, newest first.
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
                    <UploadTableRow
                      key={row.id}
                      row={row.original}
                      onPreview={setSelected}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-border divide-y md:hidden">
              {items.map((row) => (
                <UploadCard
                  key={row.upload.id}
                  row={row}
                  onPreview={setSelected}
                />
              ))}
            </div>
          </>
        )}

        <div className="border-border flex items-center justify-between gap-3 border-t px-4 py-4">
          <p className="text-muted-foreground text-xs tabular-nums">
            Page {cursorHistory.length}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={cursorHistory.length === 1 || result.isFetching}
              onClick={() =>
                setCursorHistory((history) => history.slice(0, -1))
              }
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!result.data?.nextCursor || result.isFetching}
              onClick={() => {
                const nextCursor = result.data?.nextCursor;
                if (nextCursor) {
                  setCursorHistory((history) => [...history, nextCursor]);
                }
              }}
            >
              Next
            </Button>
          </div>
        </div>
      </section>
      {selected ? (
        <AdminUploadPreview
          key={selected.upload.id}
          row={selected}
          open
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          onDeleted={uploadDeleted}
        />
      ) : null}
    </>
  );
}

function UploadTableRow({
  row,
  onPreview,
}: {
  row: AdminUploadRow;
  onPreview: (row: AdminUploadRow) => void;
}) {
  const { upload, owner, url } = row;
  return (
    <tr className="border-border hover:bg-sunken/45 border-b transition-colors last:border-b-0">
      <td className="px-3 py-2.5">
        <button
          type="button"
          onClick={() => onPreview(row)}
          className="rounded-lg outline-offset-2"
          aria-label={`Preview ${upload.originalName}`}
        >
          <PreviewThumb upload={upload} url={url} />
        </button>
      </td>
      <td className="max-w-72 px-3 py-2.5">
        <button
          type="button"
          onClick={() => onPreview(row)}
          className="hover:text-accent block max-w-full truncate text-left font-medium"
        >
          {upload.originalName}
        </button>
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

function UploadCard({
  row,
  onPreview,
}: {
  row: AdminUploadRow;
  onPreview: (row: AdminUploadRow) => void;
}) {
  const { upload, owner, url } = row;
  return (
    <article className="p-4">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onPreview(row)}
          className="shrink-0 rounded-lg outline-offset-2"
          aria-label={`Preview ${upload.originalName}`}
        >
          <PreviewThumb upload={upload} url={url} className="size-12" />
        </button>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onPreview(row)}
            className="block max-w-full truncate text-left text-sm font-semibold"
          >
            {upload.originalName}
          </button>
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
