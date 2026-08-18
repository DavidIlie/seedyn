import Link from "next/link";

import { buttonQuiet } from "~/components/ui/styles";

/**
 * Reached when an upload id does not resolve. A record owned by someone else and
 * a record that never existed produce the same answer, deliberately: the service
 * refuses to distinguish them, and so does this page.
 */
export default function AppNotFound() {
  return (
    <div className="py-16">
      <div className="border-border bg-panel max-w-md rounded-sm border p-6">
        <h1 className="text-lg font-semibold">Not found</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          This upload does not exist, or it is not yours. If you just deleted
          it, that is expected.
        </p>
        <Link href="/dashboard" className={`${buttonQuiet} mt-6`}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
