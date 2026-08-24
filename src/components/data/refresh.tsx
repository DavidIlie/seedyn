"use client";

import { useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useTransition } from "react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

/**
 * One refresh gesture for the two data layers this app reads through.
 *
 * Server components re-render via `router.refresh()`. The infinite lists keep
 * their own TanStack cache on top of the first page the server hands them, so
 * they need an invalidation too — otherwise a refreshed page still shows the
 * rows the client accumulated. Both fire together; the transition stays pending
 * until the RSC payload lands, which is the slower of the two.
 */
export function useRefresh() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries();
    startTransition(() => router.refresh());
  }, [queryClient, router]);

  return { refresh, pending };
}

/**
 * Re-reads the page when the tab comes back to the foreground.
 *
 * Returning to a tab is the moment stale data is most visible, and it is also
 * the moment a burst of duplicate work is easiest to cause: switching windows
 * can fire `focus` and `visibilitychange` together, and a file picker closing
 * fires `focus` on its own. A floor between refreshes collapses all of that
 * into one request without needing to know which event arrived.
 */
const MIN_INTERVAL_MS = 10_000;

export function RefreshOnFocus() {
  const { refresh } = useRefresh();
  // Seeded on mount rather than at construction: under Cache Components a
  // `Date.now()` in a client component body is read during the prerender, and
  // the value that matters here is when *this reader* arrived anyway.
  const lastRefreshAt = useRef(0);

  useEffect(() => {
    lastRefreshAt.current = Date.now();

    function refreshIfStale() {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRefreshAt.current < MIN_INTERVAL_MS) return;
      lastRefreshAt.current = now;
      refresh();
    }

    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => {
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
  }, [refresh]);

  return null;
}

/**
 * The manual counterpart to `RefreshOnFocus`, for when the reader knows
 * something changed elsewhere and does not want to leave and come back.
 */
export function RefreshButton({ className }: { className?: string }) {
  const { refresh, pending } = useRefresh();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={refresh}
      disabled={pending}
      aria-label="Refresh"
      className={cn("rounded-lg", className)}
    >
      <RotateCw
        aria-hidden="true"
        className={cn("size-3.5", pending && "animate-spin")}
      />
      <span className="hidden sm:inline">Refresh</span>
    </Button>
  );
}
