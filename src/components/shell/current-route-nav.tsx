"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { useEffect, useRef } from "react";

import { PrimaryNav } from "./primary-nav";

/**
 * Marks the current destination in the navigation.
 *
 * This is a client boundary for one reason: which destination is current is
 * router state, and only the browser can read it after a client navigation.
 *
 * `useSelectedLayoutSegment()` is URL data, so at prerender time it has no
 * value and Cache Components refuses to let it block the static shell. The
 * header therefore renders `PrimaryNav` directly as this component's Suspense
 * fallback — every link, at full size, with nothing marked current — and the
 * active underline streams in. On a client navigation the router already knows
 * the segment, so the hook resolves synchronously and no fallback is shown.
 */
export function CurrentRouteNav({ signOut }: { signOut: React.ReactNode }) {
  const segment = useSelectedLayoutSegment();
  const disclosure = useRef<HTMLDetailsElement>(null);

  // A native `<details>` keeps its open state across a client navigation
  // because the layout never remounts, which would leave the menu covering the
  // page the user just asked for. Closing it when the destination changes is
  // router state, not viewport measurement.
  useEffect(() => {
    if (disclosure.current) disclosure.current.open = false;
  }, [segment]);

  return (
    <PrimaryNav
      segment={segment}
      signOut={signOut}
      disclosureRef={disclosure}
    />
  );
}
