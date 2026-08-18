import { Suspense } from "react";

import { SeedynLogo } from "~/components/brand/seedyn-logo";
import { AccountMenuPlaceholder } from "./account-menu-placeholder";
import { ActionBearingHeader } from "./action-bearing-header";
import { PrimaryNav } from "./primary-nav";

/**
 * One 64px command header: identity, location, primary action, session exit.
 *
 * Upload stays in the same top-right location on every route. The active
 * destination gets both a blue tint and `aria-current`, so orientation never
 * depends on colour or on remembering where a page title came from.
 *
 * It renders on the server and contains no request data, so it belongs to the
 * static shell and survives every client navigation without re-rendering.
 */
export function AppHeader() {
  return (
    <header className="border-border bg-panel sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4">
        <SeedynLogo className="mr-2" />

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 lg:justify-start">
          {/* The fallback is the navigation itself with nothing marked current.
              Reading the active segment is URL data, which cannot be part of a
              prerendered shell, so only the current-state marker streams —
              never the links, and never the space they occupy. */}
          <Suspense
            fallback={
              <>
                <PrimaryNav segment={null} />
                <UploadActionFallback />
                <AccountMenuPlaceholder />
              </>
            }
          >
            <ActionBearingHeader />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

function UploadActionFallback() {
  return (
    <span
      aria-hidden="true"
      className="border-accent bg-accent text-accent-foreground inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-medium lg:ml-auto lg:h-10"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 11V2.75M4.75 6 8 2.75 11.25 6M2.5 10.5v2.75h11V10.5" />
      </svg>
      Upload
    </span>
  );
}
