import type { Metadata } from "next";

import {
  LibraryScreen,
  type SearchParams,
} from "~/components/library/library-screen";

export const metadata: Metadata = { title: "Files" };

export const instant = true;

export default function FilesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <LibraryScreen
      kind="files"
      path="/files"
      title="Files"
      description="Video and everything the server did not classify as an image or text."
      noun="files"
      searchParams={searchParams}
    />
  );
}
