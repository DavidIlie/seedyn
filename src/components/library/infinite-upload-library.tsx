"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { buttonQuiet } from "~/components/ui/styles";

import {
  LibraryPresentation,
  type PresentedUpload,
} from "./library-presentation";

type UploadPage = {
  items: PresentedUpload[];
  nextCursor: string | null;
};

async function fetchPage(input: {
  kind: "images" | "files" | "texts";
  query: string;
  order: "newest" | "oldest";
  cursor: string | null;
  signal: AbortSignal;
}): Promise<UploadPage> {
  const params = new URLSearchParams({ kind: input.kind, order: input.order });
  if (input.query) params.set("q", input.query);
  if (input.cursor) params.set("cursor", input.cursor);
  const response = await fetch(`/api/uploads?${params}`, {
    headers: { Accept: "application/json" },
    signal: input.signal,
  });
  if (!response.ok)
    throw new Error(`Upload listing failed (${response.status}).`);
  return (await response.json()) as UploadPage;
}

export function InfiniteUploadLibrary({
  kind,
  query,
  order,
  initialCursor,
  initialPage,
  fallbackNextHref,
  backToNewestHref,
}: {
  kind: "images" | "files" | "texts";
  query: string;
  order: "newest" | "oldest";
  initialCursor: string | null;
  initialPage: UploadPage;
  fallbackNextHref: string | null;
  backToNewestHref: string | null;
}) {
  const [hydrated, setHydrated] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ["uploads", kind, query, order, initialCursor] as const,
    [initialCursor, kind, order, query],
  );
  const result = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      fetchPage({ kind, query, order, cursor: pageParam, signal }),
    initialPageParam: initialCursor,
    initialData: { pages: [initialPage], pageParams: [initialCursor] },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const {
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = result;

  useEffect(() => setHydrated(true), []);

  // A server refresh after an upload or deletion sends a new authoritative
  // first page. Replace accumulated client pages so stale cursors cannot keep
  // a deleted row around or duplicate a newly inserted row.
  useEffect(() => {
    queryClient.setQueryData(queryKey, {
      pages: [initialPage],
      pageParams: [initialCursor],
    });
  }, [initialCursor, initialPage, queryClient, queryKey]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage || isFetchingNextPage || isFetchNextPageError) {
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void fetchNextPage();
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError]);

  const items = result.data.pages.flatMap((page) => page.items);

  return (
    <>
      <LibraryPresentation items={items} />
      {!hydrated && (fallbackNextHref || backToNewestHref) ? (
        <nav aria-label="Pagination" className="flex gap-2 pt-4">
          {backToNewestHref ? (
            <a href={backToNewestHref} className={buttonQuiet}>
              Back to newest
            </a>
          ) : null}
          {fallbackNextHref ? (
            <a href={fallbackNextHref} className={buttonQuiet}>
              Next page
            </a>
          ) : null}
        </nav>
      ) : null}
      {hydrated ? (
        <div className="flex flex-col items-center gap-2 pt-4">
          <div ref={sentinel} aria-hidden="true" className="h-px w-full" />
          {result.hasNextPage ? (
            <button
              type="button"
              className={buttonQuiet}
              disabled={result.isFetchingNextPage}
              onClick={() => void result.fetchNextPage()}
            >
              {result.isFetchingNextPage
                ? "Loading…"
                : result.isFetchNextPageError
                  ? "Try again"
                  : "Load more"}
            </button>
          ) : (
            <p className="text-muted-foreground text-xs">End of results</p>
          )}
          {backToNewestHref ? (
            <a href={backToNewestHref} className={buttonQuiet}>
              Back to newest
            </a>
          ) : null}
          {result.isFetchNextPageError ? (
            <p role="alert" className="text-danger text-sm">
              More uploads could not be loaded. Try again.
            </p>
          ) : null}
          <p className="sr-only" aria-live="polite">
            {result.isFetchingNextPage
              ? "Loading more uploads."
              : `${items.length} uploads loaded.`}
          </p>
        </div>
      ) : null}
    </>
  );
}
