import Link from "next/link";

import { buttonQuiet } from "~/components/ui/styles";

/**
 * Rendered when a segment calls `forbidden()`, which answers HTTP 403.
 *
 * As with `unauthorized.tsx`, this needs `experimental.authInterrupts` in
 * `next.config.mjs` before anything can reach it. Ownership failures currently
 * surface as a uniform 404 instead, which is the stated policy for upload
 * records: a record you do not own must not be distinguishable from one that
 * does not exist.
 */
export default function Forbidden() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-16">
      <div className="border-border bg-panel rounded-sm border p-6">
        <h1 className="text-lg font-semibold">Not allowed</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Your account is signed in but does not have access to this. Nothing
          was changed.
        </p>
        <Link href="/dashboard" className={`${buttonQuiet} mt-6`}>
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
