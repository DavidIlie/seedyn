import { Upload } from "lucide-react";
import { Suspense } from "react";

import { SeedynLogo } from "~/components/brand/seedyn-logo";
import { buttonVariants } from "~/components/ui/button";
import { cn } from "~/lib/utils";
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
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-4 sm:px-6 lg:px-8">
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

/**
 * The inert twin of `UploadAction`, built from the same Button variant so the
 * two cannot drift apart. It occupies the trigger's space while the header's
 * request-time half streams in.
 */
function UploadActionFallback() {
  return (
    <span
      aria-hidden="true"
      className={cn(
        buttonVariants(),
        "max-[390px]:size-11 max-[390px]:px-0 lg:ml-auto",
      )}
    >
      <Upload className="size-4" />
      <span className="max-[390px]:sr-only">Upload</span>
    </span>
  );
}
