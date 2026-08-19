"use client";

import {
  coreFeatures,
  createCoreRowModel,
  tableFeatures,
  useTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Eye, EyeOff, LayoutGrid, List, TableProperties } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  formatBytes,
  formatTimestamp,
  lifecycleLabel,
  uploadKindGlyph,
  uploadKindLabel,
} from "~/components/lib/format";
import { CopyButton } from "~/components/ui/copy-button";
import type { SerializedUpload } from "~/server/uploads/serialization";

import { UploadRow } from "./upload-row";

type ViewMode = "list" | "table" | "grid";
export type PresentedUpload = SerializedUpload & { url: string };

const VIEW_KEY = "seedyn.library.view";
const PRIVACY_KEY = "seedyn.library.privacy";
const VIRTUALIZE_AFTER = 48;

const TABLE_FEATURES = tableFeatures({
  ...coreFeatures,
  coreRowModel: createCoreRowModel(),
});

const TABLE_COLUMNS = [
  { accessorKey: "originalName", header: "Name" },
  { accessorKey: "kind", header: "Type" },
  { accessorKey: "byteSize", header: "Size" },
  { accessorKey: "createdAt", header: "Uploaded" },
] satisfies ColumnDef<typeof TABLE_FEATURES, PresentedUpload>[];

const VIEWS = [
  { value: "list", label: "Compact", icon: List },
  { value: "table", label: "Table", icon: TableProperties },
  { value: "grid", label: "Cards", icon: LayoutGrid },
] as const;

export function LibraryPresentation({ items }: { items: PresentedUpload[] }) {
  const [view, setView] = useState<ViewMode>("list");
  // Start covered. A saved privacy preference must never briefly reveal a
  // thumbnail while hydration catches up with localStorage.
  const [privacy, setPrivacy] = useState(true);

  useEffect(() => {
    const savedView = window.localStorage.getItem(VIEW_KEY);
    if (savedView === "list" || savedView === "table" || savedView === "grid") {
      setView(savedView);
    }
    setPrivacy(window.localStorage.getItem(PRIVACY_KEY) === "true");
  }, []);

  function chooseView(next: ViewMode) {
    setView(next);
    window.localStorage.setItem(VIEW_KEY, next);
  }

  function togglePrivacy() {
    setPrivacy((current) => {
      const next = !current;
      window.localStorage.setItem(PRIVACY_KEY, String(next));
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Library presentation"
          className="border-border bg-sunken inline-flex rounded-lg border p-0.5"
        >
          {VIEWS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => chooseView(value)}
              className="text-muted-foreground hover:text-foreground aria-pressed:bg-panel aria-pressed:text-accent inline-flex h-10 items-center gap-2 rounded-md px-3 text-xs font-medium transition-colors aria-pressed:shadow-sm"
            >
              <Icon aria-hidden="true" className="size-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-pressed={privacy}
          onClick={togglePrivacy}
          className="border-border bg-panel hover:bg-sunken hover:border-border-strong inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors"
        >
          {privacy ? (
            <EyeOff aria-hidden="true" className="text-accent size-3.5" />
          ) : (
            <Eye
              aria-hidden="true"
              className="text-muted-foreground size-3.5"
            />
          )}
          Privacy {privacy ? "on" : "off"}
        </button>
      </div>

      {view === "list" ? (
        <CompactUploadList items={items} privacy={privacy} />
      ) : view === "table" ? (
        <UploadTable items={items} privacy={privacy} />
      ) : (
        <UploadCards items={items} privacy={privacy} />
      )}
    </div>
  );
}

function UploadTable({
  items,
  privacy,
}: {
  items: PresentedUpload[];
  privacy: boolean;
}) {
  const columns = useMemo(() => TABLE_COLUMNS, []);
  const table = useTable({
    features: TABLE_FEATURES,
    columns,
    data: items,
  });

  return (
    <div className="border-border bg-panel overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[47rem] text-left text-sm">
        <thead className="bg-sunken text-muted-foreground text-xs">
          <tr className="border-border border-b">
            <th className="w-16 px-3 py-2.5 font-medium">Preview</th>
            <th className="px-3 py-2.5 font-medium">Name</th>
            <th className="px-3 py-2.5 font-medium">Type</th>
            <th className="px-3 py-2.5 font-medium">Size</th>
            <th className="px-3 py-2.5 font-medium">Uploaded</th>
            <th className="w-24 px-3 py-2.5 text-right font-medium">URL</th>
          </tr>
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const upload = row.original;
            return (
              <tr
                key={row.id}
                className="border-border hover:bg-sunken/60 border-b transition-colors last:border-b-0"
              >
                <td className="px-3 py-2">
                  <MediaPreview upload={upload} privacy={privacy} compact />
                </td>
                <td className="max-w-72 px-3 py-2">
                  <Link
                    href={`/uploads/${upload.id}`}
                    className="hover:text-accent block truncate font-medium"
                  >
                    {upload.originalName}
                  </Link>
                  <span className="text-muted-foreground block truncate font-mono text-[0.6875rem]">
                    {upload.publicSlug}.{upload.extension}
                  </span>
                </td>
                <td className="text-muted-foreground px-3 py-2">
                  {uploadKindLabel(upload.kind, upload.contentType)}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {formatBytes(upload.byteSize)}
                </td>
                <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                  {formatTimestamp(upload.createdAt)}
                </td>
                <td className="px-3 py-2 text-right">
                  <CopyButton
                    value={upload.url}
                    label={`Copy URL for ${upload.originalName}`}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CompactUploadList({
  items,
  privacy,
}: {
  items: PresentedUpload[];
  privacy: boolean;
}) {
  if (items.length <= VIRTUALIZE_AFTER) {
    return (
      <ul className="border-border bg-panel overflow-hidden rounded-xl border">
        {items.map((upload) => (
          <UploadRow
            key={upload.id}
            upload={upload}
            url={upload.url}
            privacy={privacy}
          />
        ))}
      </ul>
    );
  }

  return <VirtualCompactUploadList items={items} privacy={privacy} />;
}

function VirtualCompactUploadList({
  items,
  privacy,
}: {
  items: PresentedUpload[];
  privacy: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => viewport.current,
    estimateSize: () => 64,
    getItemKey: (index) => items[index]?.id ?? index,
    overscan: 8,
  });

  return (
    <div
      ref={viewport}
      role="region"
      aria-label="Virtualized uploads"
      className="border-border bg-panel max-h-[min(70dvh,48rem)] overflow-auto rounded-xl border"
    >
      <div
        role="list"
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const upload = items[virtualRow.index];
          if (!upload) return null;
          return (
            <div
              key={upload.id}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              role="listitem"
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <UploadRow
                upload={upload}
                url={upload.url}
                privacy={privacy}
                wrapper="div"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UploadCards({
  items,
  privacy,
}: {
  items: PresentedUpload[];
  privacy: boolean;
}) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
      {items.map((upload) => {
        const lifecycle = lifecycleLabel(upload.state);
        return (
          <li
            key={upload.id}
            className="border-border bg-panel group relative min-w-0 overflow-hidden rounded-xl border"
          >
            <MediaPreview upload={upload} privacy={privacy} />
            <div className="space-y-3 p-3">
              <div className="min-w-0">
                <Link
                  href={`/uploads/${upload.id}`}
                  className="row-link block truncate text-sm font-semibold"
                >
                  {upload.originalName}
                </Link>
                <p className="text-muted-foreground mt-0.5 truncate font-mono text-[0.6875rem]">
                  {upload.publicSlug}.{upload.extension}
                </p>
              </div>
              <div className="text-muted-foreground flex items-center justify-between gap-3 text-xs">
                <span className="truncate">
                  {uploadKindLabel(upload.kind, upload.contentType)} ·{" "}
                  {formatBytes(upload.byteSize)}
                </span>
                {lifecycle ? (
                  <span className="text-danger shrink-0">{lifecycle}</span>
                ) : null}
              </div>
              <div className="row-control flex items-center justify-between gap-3">
                <span className="text-muted-foreground truncate text-[0.6875rem] tabular-nums">
                  {formatTimestamp(upload.createdAt).replace(" UTC", "")}
                </span>
                <CopyButton
                  value={upload.url}
                  label={`Copy URL for ${upload.originalName}`}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function MediaPreview({
  upload,
  privacy,
  compact = false,
}: {
  upload: PresentedUpload;
  privacy: boolean;
  compact?: boolean;
}) {
  const ready = upload.state === "READY";
  const image = upload.kind === "IMAGE" && ready;
  const video = upload.kind === "VIDEO" && ready;
  const mediaClass =
    "absolute inset-0 h-full w-full object-cover transition-[filter,transform] duration-200 " +
    (privacy ? "blur-xl scale-110" : "group-hover:scale-[1.02]");

  return (
    <span
      aria-hidden="true"
      className={
        "bg-sunken relative grid shrink-0 place-items-center overflow-hidden " +
        (compact
          ? "border-border size-11 rounded-lg border"
          : "aspect-[4/3] w-full")
      }
    >
      <span className="text-muted-foreground font-mono text-xs tracking-wider">
        {uploadKindGlyph(upload.kind)}
      </span>
      {image ? (
        // oxlint-disable-next-line next/no-img-element -- immutable user media deliberately bypasses the optimizer
        <img
          src={privacy ? undefined : upload.url}
          alt=""
          loading="lazy"
          decoding="async"
          width={upload.width ?? 640}
          height={upload.height ?? 480}
          className={mediaClass}
        />
      ) : video && !compact ? (
        <video
          src={privacy ? undefined : upload.url}
          muted
          playsInline
          preload="metadata"
          className={mediaClass}
        />
      ) : null}
      {privacy && (image || video) ? (
        <span className="bg-sunken/45 absolute inset-0 grid place-items-center backdrop-blur-xl">
          <EyeOff className="text-muted-foreground size-5" />
        </span>
      ) : null}
    </span>
  );
}
