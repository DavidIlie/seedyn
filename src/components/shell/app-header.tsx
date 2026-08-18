import Link from "next/link";
import { Suspense } from "react";

import { UploadAction } from "~/components/upload/upload-action";

import { ActionBearingHeader } from "./action-bearing-header";
import { PrimaryNav } from "./primary-nav";

/**
 * One quiet 56px header, and no rail anywhere in the product.
 *
 * It is deliberately flat: a single one-pixel bottom border, no shadow, no
 * blur, no tint. Content scrolling underneath is separated by the border alone,
 * which stays legible in both themes and at 200% zoom.
 *
 * It renders on the server and contains no request data, so it belongs to the
 * static shell and survives every client navigation without re-rendering.
 */
export function AppHeader() {
  return (
    <header className="border-border bg-background sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
        <Link
          href="/dashboard"
          className="text-[15px] font-semibold tracking-tight"
        >
          seedyn
        </Link>

        <div className="ml-auto flex items-center gap-3">
          {/* Below 768px the header carries the upload action, because the page
              header collapses to a title alone. Above it, upload lives in the
              page header next to the content it adds to. */}
          <UploadAction className="md:hidden" />

          {/* The fallback is the navigation itself with nothing marked current.
              Reading the active segment is URL data, which cannot be part of a
              prerendered shell, so only the underline streams — never the
              links, and never the space they occupy. */}
          <Suspense
            fallback={
              <>
                <PrimaryNav segment={null} signOut={<SignOutPlaceholder />} />
                <SignOutPlaceholder className="hidden md:flex" />
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

function SignOutPlaceholder({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`text-muted-foreground h-11 w-full items-center px-3 text-sm md:h-9 md:w-auto md:px-2 ${className || "flex"}`}
    >
      Sign out
    </span>
  );
}
