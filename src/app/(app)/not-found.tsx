import Link from "next/link";

import { Button } from "~/components/ui/button";

/**
 * Reached when an upload id does not resolve. A record owned by someone else and
 * a record that never existed produce the same answer, deliberately: the service
 * refuses to distinguish them, and so does this page.
 */
export default function AppNotFound() {
  return (
    <div className="py-16">
      <div className="border-border bg-panel max-w-md rounded-xl border p-6">
        <h1 className="text-lg font-semibold">Not found</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          This upload does not exist, or it is not yours. If you just deleted
          it, that is expected.
        </p>
        <Button variant="outline" asChild className="mt-6">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
