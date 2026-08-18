"use client";

import Link from "next/link";

import { buttonPrimary, buttonQuiet } from "~/components/ui/styles";

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
      <div className="border-border bg-panel rounded-sm border p-6">
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
          <button
            type="button"
            onClick={() => retry()}
            className={buttonPrimary}
          >
            Try again
          </button>
          <Link href="/dashboard" className={buttonQuiet}>
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
