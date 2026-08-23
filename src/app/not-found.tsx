import Link from "next/link";

import { Button } from "~/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-16">
      <div className="border-border bg-panel rounded-xl border p-6">
        <h1 className="text-lg font-semibold">Not found</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          There is nothing at this address. Public media lives on the separate
          media origin, not here.
        </p>
        <Button variant="outline" asChild className="mt-6">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
