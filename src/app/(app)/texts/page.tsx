import type { Metadata } from "next";
import Link from "next/link";

import {
  LibraryScreen,
  type SearchParams,
} from "~/components/library/library-screen";
import { Button } from "~/components/ui/button";
import { UploadAction } from "~/components/upload/upload-button";

export const metadata: Metadata = { title: "Texts" };

export const instant = true;

/**
 * Texts get two entry points because there are genuinely two ways in: write one
 * here, or upload one that already exists. Both sit in the same header slot as
 * the single button on `/images` and `/files`.
 */
export default function TextsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <LibraryScreen
      kind="texts"
      path="/texts"
      title="Texts"
      description="Plain-text uploads, served inline from the public origin."
      noun="texts"
      searchParams={searchParams}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <UploadAction
            label="Upload text"
            variant="outline"
            accept="text/*,.md,.json,.yaml,.yml,.toml,.csv"
          />
          <Button asChild>
            <Link href="/texts/new">New text</Link>
          </Button>
        </div>
      }
    />
  );
}
