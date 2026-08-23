"use client";

import Link from "next/link";

import { Button } from "~/components/ui/button";

/**
 * Recovery inside the authenticated shell.
 *
 * This boundary sits below `(app)/layout.tsx`, so the header and the main
 * landmark stay mounted and the user keeps their navigation. Only the page
 * region is replaced.
 */
export default function AppSectionError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="py-16">
      <div className="border-border bg-panel max-w-md rounded-xl border p-6">
        <h1 className="text-lg font-semibold">This page could not load</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          A read failed on the way to rendering it. Your uploads are unaffected
          — nothing here writes on load.
        </p>
        {error.digest ? (
          <p className="text-muted-foreground mt-4 font-mono text-xs">
            Reference {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-2">
          <Button type="button" onClick={() => retry()}>
            Try again
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
