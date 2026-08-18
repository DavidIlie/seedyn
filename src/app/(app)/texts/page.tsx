import type { Metadata } from "next";

import {
  LibraryScreen,
  type SearchParams,
} from "~/components/library/library-screen";

export const metadata: Metadata = { title: "Texts" };

export const instant = true;

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
    />
  );
}
