import type { Metadata } from "next";

import {
  LibraryScreen,
  type SearchParams,
} from "~/components/library/library-screen";

export const metadata: Metadata = { title: "Images" };

export const instant = true;

export default function ImagesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <LibraryScreen
      kind="images"
      path="/images"
      title="Images"
      description="Screenshots and other image uploads."
      noun="images"
      searchParams={searchParams}
    />
  );
}
