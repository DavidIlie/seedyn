"use client";

import Link from "next/link";

import { buttonPrimary, buttonQuiet } from "~/components/ui/styles";

export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <div className="grid min-h-[60dvh] place-items-center py-16">
      <div className="max-w-md text-center">
        <p className="text-muted-foreground text-sm font-medium">Admin</p>
        <h1 className="font-display mt-2 text-2xl font-semibold">
          Couldn’t load the ledger
        </h1>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          Seedyn could not read the current analytics snapshot. No stored
          content was changed.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={reset} className={buttonPrimary}>
            Retry
          </button>
          <Link href="/dashboard" className={buttonQuiet}>
            Back to library
          </Link>
        </div>
      </div>
    </div>
  );
}
