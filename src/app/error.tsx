"use client";

import Link from "next/link";

import { Button } from "~/components/ui/button";

/**
 * The application-wide recovery boundary.
 *
 * `retry()` re-fetches and re-renders the boundary's children, so a failure
 * caused by a database or storage blip clears without a full document reload.
 * In production the `message` is a generic string by design; the digest is the
 * only thing that ties this screen to a server log line, so it is shown.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-16">
      <div className="border-border bg-panel rounded-xl border p-6">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          The page could not be rendered. Nothing you were doing was saved or
          changed by this error.
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
    </main>
  );
}
