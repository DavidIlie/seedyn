import { getSchema, type Extensions, type JSONContent } from "@tiptap/core";
import { CharacterCount } from "@tiptap/extension-character-count";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { Typography } from "@tiptap/extension-typography";
import { Markdown, MarkdownManager } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";

export const DOCUMENT_LANGUAGE = "document";

export const EMPTY_DOCUMENT: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const MAX_DOCUMENT_NODES = 10_000;
const MAX_DOCUMENT_DEPTH = 64;

function linkIsSafe(href: string): boolean {
  if (href.startsWith("/") || href.startsWith("#")) return true;
  try {
    return SAFE_LINK_PROTOCOLS.has(new URL(href).protocol);
  } catch {
    return false;
  }
}

/**
 * The schema shared by the browser editor and the server renderer. Images,
 * embeds and raw HTML are deliberately absent: a document can only contain
 * Tiptap's text-oriented nodes and safe links.
 */
export function documentExtensions(input?: {
  placeholder?: string;
  withEditorUtilities?: boolean;
}): Extensions {
  const extensions: Extensions = [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        markdownLinks: true,
        HTMLAttributes: {
          rel: "noopener noreferrer nofollow",
          target: "_blank",
        },
        isAllowedUri: (url, { defaultValidate }) =>
          defaultValidate(url) && linkIsSafe(url),
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Markdown,
  ];

  if (input?.withEditorUtilities) {
    extensions.push(
      Typography,
      CharacterCount,
      Placeholder.configure({
        placeholder:
          input.placeholder ?? "Write something, or press / for commands…",
      }),
    );
  }
  return extensions;
}

export function parseMarkdownDocument(markdown: string): JSONContent {
  const manager = new MarkdownManager({ extensions: documentExtensions() });
  return normalizeDocument(manager.parse(markdown));
}

export function documentToMarkdown(content: JSONContent): string {
  const manager = new MarkdownManager({ extensions: documentExtensions() });
  return manager.serialize(normalizeDocument(content));
}

function normalizeDocument(content: JSONContent): JSONContent {
  if (!isRecord(content)) throw new Error("This document has no content.");
  assertDocumentBudget(content);

  // ProseMirror owns structural validation. Unknown nodes, invalid nesting and
  // malformed marks fail here instead of reaching either renderer.
  const schema = getSchema(documentExtensions());
  const document = schema.nodeFromJSON(content);
  const normalized = document.toJSON();
  removeUnsafeLinks(normalized);
  return schema.nodeFromJSON(normalized).toJSON();
}

function assertDocumentBudget(content: Record<string, unknown>): void {
  const stack: Array<{ value: unknown; depth: number }> = [
    { value: content, depth: 0 },
  ];
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (!isRecord(current.value)) {
      throw new Error("This document contains a malformed node.");
    }
    nodes += 1;
    if (nodes > MAX_DOCUMENT_NODES || current.depth > MAX_DOCUMENT_DEPTH) {
      throw new Error("This document is too complex to render safely.");
    }
    const children = current.value.content;
    if (children === undefined) continue;
    if (!Array.isArray(children)) {
      throw new Error("This document contains malformed child content.");
    }
    for (const child of children) {
      stack.push({ value: child, depth: current.depth + 1 });
    }
  }
}

function removeUnsafeLinks(node: JSONContent): void {
  if (node.marks) {
    node.marks = node.marks.flatMap((mark) => {
      if (mark.type !== "link") return [mark];
      const href = mark.attrs?.href;
      if (typeof href !== "string" || !linkIsSafe(href)) return [];
      return [
        {
          type: "link",
          attrs: {
            href,
            target: "_blank",
            rel: "noopener noreferrer nofollow",
            class: null,
          },
        },
      ];
    });
  }
  for (const child of node.content ?? []) removeUnsafeLinks(child);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
