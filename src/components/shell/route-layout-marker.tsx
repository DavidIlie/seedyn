"use client";

import { useSelectedLayoutSegment } from "next/navigation";

/**
 * Expose layout geometry from router state rather than from the page DOM.
 *
 * Next keeps the previous route tree mounted with `display: none !important`
 * during client navigation. This marker belongs to the shared layout and
 * updates in place, so CSS never mistakes a retained docs page for the active
 * route. Server Component page children remain outside this client boundary
 * and render exactly once.
 */
export function RouteLayoutMarker() {
  const segment = useSelectedLayoutSegment();

  return (
    <span hidden data-main-layout={segment === "docs" ? "docs" : "product"} />
  );
}
