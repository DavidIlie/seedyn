import { renderToReactElement } from "@tiptap/static-renderer/pm/react";

import {
  documentExtensions,
  parseMarkdownDocument,
} from "~/components/text/document-format";

export function DocumentReadView({
  content,
  filename,
}: {
  content: string;
  filename: string;
}) {
  try {
    const document = parseMarkdownDocument(content);
    const rendered = renderToReactElement({
      content: document,
      extensions: documentExtensions(),
    });
    return (
      <article
        aria-label={`Contents of ${filename}`}
        className="seedyn-document-reader border-border bg-panel min-h-64 rounded-xl border px-5 py-6 sm:px-8 sm:py-8"
      >
        {rendered}
      </article>
    );
  } catch {
    return (
      <div className="border-border bg-sunken flex min-h-48 items-center justify-center rounded-xl border p-6 text-center">
        <div>
          <p className="font-medium">Document preview unavailable</p>
          <p className="text-muted-foreground mt-1 text-sm">
            The stored document is malformed or uses an unsupported format.
          </p>
        </div>
      </div>
    );
  }
}
