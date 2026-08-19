"use client";

import { Extension, type Editor, type Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import {
  Suggestion,
  type SuggestionOptions,
  type SuggestionProps,
} from "@tiptap/suggestion";
import {
  Code2,
  Heading1,
  Heading2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  type LucideIcon,
} from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export type DocumentSlashItem = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  keywords: string;
  command: (input: { editor: Editor; range: Range }) => void;
};

const ITEMS: DocumentSlashItem[] = [
  {
    id: "text",
    title: "Text",
    description: "A plain paragraph",
    icon: Pilcrow,
    keywords: "paragraph body",
    command: ({ editor }) => editor.chain().focus().setParagraph().run(),
  },
  {
    id: "heading-1",
    title: "Heading 1",
    description: "Large section heading",
    icon: Heading1,
    keywords: "title h1",
    command: ({ editor }) =>
      editor.chain().focus().setHeading({ level: 1 }).run(),
  },
  {
    id: "heading-2",
    title: "Heading 2",
    description: "Medium section heading",
    icon: Heading2,
    keywords: "subtitle h2",
    command: ({ editor }) =>
      editor.chain().focus().setHeading({ level: 2 }).run(),
  },
  {
    id: "bullet-list",
    title: "Bullet list",
    description: "Create a simple list",
    icon: List,
    keywords: "unordered bullets",
    command: ({ editor }) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    id: "ordered-list",
    title: "Numbered list",
    description: "Create a numbered list",
    icon: ListOrdered,
    keywords: "ordered numbers",
    command: ({ editor }) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "task-list",
    title: "To-do list",
    description: "Track tasks with checkboxes",
    icon: ListChecks,
    keywords: "task checkbox checklist",
    command: ({ editor }) =>
      editor.chain().focus().toggleList("taskList", "taskItem").run(),
  },
  {
    id: "quote",
    title: "Quote",
    description: "Capture a quotation",
    icon: Quote,
    keywords: "blockquote citation",
    command: ({ editor }) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    id: "code-block",
    title: "Code block",
    description: "A formatted block of code",
    icon: Code2,
    keywords: "snippet pre",
    command: ({ editor }) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: "divider",
    title: "Divider",
    description: "Separate sections",
    icon: Minus,
    keywords: "rule separator horizontal",
    command: ({ editor }) => editor.chain().focus().setHorizontalRule().run(),
  },
];

type MenuHandle = { onKeyDown: (event: KeyboardEvent) => boolean };

const DocumentSlashMenu = forwardRef<
  MenuHandle,
  SuggestionProps<DocumentSlashItem, DocumentSlashItem>
>(function DocumentSlashMenu({ items, command }, forwardedRef) {
  const [active, setActive] = useState(0);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const safeActive = Math.min(active, Math.max(0, items.length - 1));

  useEffect(() => setActive(0), [items]);
  useEffect(() => {
    buttonRefs.current[safeActive]?.scrollIntoView({ block: "nearest" });
  }, [safeActive]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      onKeyDown: (event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setActive((value) => (items.length ? (value + 1) % items.length : 0));
          return true;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setActive((value) =>
            items.length ? (value - 1 + items.length) % items.length : 0,
          );
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          const item = items[safeActive];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }),
    [command, items, safeActive],
  );

  if (!items.length) {
    return (
      <div className="border-border bg-panel text-muted-foreground rounded-xl border px-3 py-2 text-sm shadow-xl">
        No commands found
      </div>
    );
  }

  return (
    <div
      role="menu"
      aria-label="Insert block"
      className="border-border bg-panel max-h-80 w-72 overflow-y-auto rounded-xl border p-1 shadow-xl"
    >
      <p className="text-muted-foreground px-2 pt-1.5 pb-1 text-[0.6875rem] font-semibold tracking-[0.08em] uppercase">
        Blocks
      </p>
      {items.map((item, index) => {
        const Icon = item.icon;
        const selected = index === safeActive;
        return (
          <button
            key={item.id}
            ref={(element) => {
              buttonRefs.current[index] = element;
            }}
            type="button"
            role="menuitem"
            onMouseEnter={() => setActive(index)}
            onMouseDown={(event) => {
              event.preventDefault();
              command(item);
            }}
            className={`flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors ${
              selected
                ? "bg-sunken text-foreground ring-accent/45 ring-1"
                : "hover:bg-sunken"
            }`}
          >
            <span className="border-border bg-sunken text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg border">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{item.title}</span>
              <span className="text-muted-foreground block text-xs">
                {item.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
});

export const DocumentSlashCommand = Extension.create<{
  items: DocumentSlashItem[];
  render: SuggestionOptions<DocumentSlashItem, DocumentSlashItem>["render"];
}>({
  name: "seedynDocumentSlashCommand",
  addOptions() {
    return { items: ITEMS, render: () => ({}) };
  },
  addProseMirrorPlugins() {
    return [
      Suggestion<DocumentSlashItem, DocumentSlashItem>({
        editor: this.editor,
        char: "/",
        allowedPrefixes: null,
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).run();
          props.command({ editor, range });
        },
        items: ({ query }) => {
          const needle = query.trim().toLowerCase();
          if (!needle) return this.options.items;
          return this.options.items.filter((item) =>
            `${item.title} ${item.description} ${item.keywords}`
              .toLowerCase()
              .includes(needle),
          );
        },
        render: this.options.render,
      }),
    ];
  },
});

export function createDocumentSlashRenderer(): SuggestionOptions<
  DocumentSlashItem,
  DocumentSlashItem
>["render"] {
  return () => {
    let renderer: ReactRenderer<
      MenuHandle,
      SuggestionProps<DocumentSlashItem, DocumentSlashItem>
    > | null = null;
    let unmount: (() => void) | null = null;

    return {
      onStart: (props) => {
        renderer = new ReactRenderer(DocumentSlashMenu, {
          editor: props.editor,
          props,
        });
        unmount = props.mount(renderer.element);
      },
      onUpdate: (props) => renderer?.updateProps(props),
      onKeyDown: ({ event }) => {
        if (event.key === "Escape") return false;
        return renderer?.ref?.onKeyDown(event) ?? false;
      },
      onExit: () => {
        unmount?.();
        renderer?.destroy();
        unmount = null;
        renderer = null;
      },
    };
  };
}
