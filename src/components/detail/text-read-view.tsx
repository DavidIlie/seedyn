import { codeToHtml } from "shiki";

import {
  isTextLanguage,
  languageFromFilename,
} from "~/components/text/languages";
import { readOwnedTextContent } from "~/server/uploads/text-reader";
import type { SerializedUpload } from "~/server/uploads/serialization";

const SHIKI_LANGUAGES = new Set([
  "bash",
  "css",
  "html",
  "javascript",
  "json",
  "markdown",
  "plaintext",
  "python",
  "rust",
  "sql",
  "tsx",
  "typescript",
  "xml",
  "yaml",
]);

export async function TextReadView({
  upload,
  userId,
}: {
  upload: SerializedUpload;
  userId: string;
}) {
  const result = await readOwnedTextContent(userId, upload.id);
  if (result.status !== "ready") {
    return (
      <div className="border-border bg-sunken flex min-h-48 items-center justify-center rounded-xl border p-6 text-center">
        <div>
          <p className="font-medium">
            {result.status === "too_large"
              ? "Preview limited to 1 MB"
              : "Preview unavailable"}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            Open the raw text using the permanent link.
          </p>
        </div>
      </div>
    );
  }

  const candidate =
    upload.textLanguage ?? languageFromFilename(upload.originalName);
  const language =
    isTextLanguage(candidate) && SHIKI_LANGUAGES.has(candidate)
      ? candidate
      : "plaintext";
  const html = await codeToHtml(result.content, {
    lang: language === "plaintext" ? "text" : language,
    themes: { light: "github-light", dark: "github-dark" },
  });

  return (
    <section
      aria-label={`Contents of ${upload.originalName}`}
      className="text-reader border-border bg-panel overflow-hidden rounded-xl border"
    >
      <div className="border-border text-muted-foreground flex items-center justify-between border-b px-3 py-2 text-xs">
        <span className="truncate font-mono">{upload.originalName}</span>
        <span>{language}</span>
      </div>
      <div
        className="max-h-[42rem] overflow-auto text-sm"
        // Shiki escapes source text and supplies only its own highlighted markup.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  );
}
