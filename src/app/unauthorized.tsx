import Link from "next/link";

import { Button } from "~/components/ui/button";

/**
 * Rendered when a segment calls `unauthorized()`, which answers HTTP 401.
 *
 * Nothing calls it yet: the file conventions `unauthorized.js` and
 * `forbidden.js` require `experimental.authInterrupts` in `next.config.mjs`,
 * which is outside this change. Until that flag is set, the UI reaches
 * `/sign-in` by redirect instead, and this page is the prepared destination.
 */
export default function Unauthorized() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-16">
      <div className="border-border bg-panel rounded-xl border p-6">
        <h1 className="text-lg font-semibold">Sign in to continue</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          This page belongs to a Seedyn account. Signing in will bring you back
          here.
        </p>
        <Button asChild className="mt-6">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </div>
    </main>
  );
}
