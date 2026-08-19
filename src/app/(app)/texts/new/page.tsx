import type { Metadata } from "next";
import Link from "next/link";

import { TextComposer } from "~/components/text/text-composer";

export const metadata: Metadata = { title: "New text or document" };
export const instant = true;

export default function NewTextPage() {
  return (
    <>
      <div className="pt-8 pb-4">
        <Link
          href="/texts"
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          ← Texts
        </Link>
      </div>
      <div className="pb-6">
        <h1 className="font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.025em]">
          New text or document
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Publish a syntax-highlighted code file or a Notion-style rich document
          with Markdown import and export.
        </p>
      </div>
      <TextComposer />
    </>
  );
}
