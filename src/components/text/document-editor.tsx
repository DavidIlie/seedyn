"use client";

import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import {
  Bold,
  Code2,
  Heading1,
  Heading2,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo } from "react";

import { cn } from "~/lib/utils";

import { documentExtensions, EMPTY_DOCUMENT } from "./document-format";
import {
  createDocumentSlashRenderer,
  DocumentSlashCommand,
} from "./document-slash-menu";

function readContent(value: string): JSONContent {
  try {
    const parsed = JSON.parse(value) as JSONContent;
    return parsed?.type === "doc" ? parsed : EMPTY_DOCUMENT;
  } catch {
    return EMPTY_DOCUMENT;
  }
}

export function DocumentEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const slashRenderer = useMemo(() => createDocumentSlashRenderer(), []);
  const extensions = useMemo(
    () => [
      ...documentExtensions({
        withEditorUtilities: true,
        placeholder: "Write something, or press / for commands…",
      }),
      DocumentSlashCommand.configure({ render: slashRenderer }),
    ],
    [slashRenderer],
  );
  const editor = useEditor(
    {
      extensions,
      content: readContent(value),
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: "seedyn-document-content focus:outline-none",
          role: "textbox",
          "aria-label": "Document content",
          "aria-multiline": "true",
        },
      },
      onUpdate: ({ editor: current }) => {
        onChange(JSON.stringify(current.getJSON()));
      },
    },
    [extensions],
  );

  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    if (current === value) return;
    editor.commands.setContent(readContent(value), { emitUpdate: false });
  }, [editor, value]);

  if (!editor) {
    return (
      <div
        role="status"
        aria-label="Loading document editor"
        className="bg-sunken min-h-96 animate-pulse"
      />
    );
  }

  return (
    <div className="seedyn-document-editor">
      <DocumentToolbar editor={editor} />
      <EditorContent editor={editor} />
      <DocumentCounter editor={editor} />
    </div>
  );
}

function DocumentToolbar({
  editor,
}: {
  editor: NonNullable<ReturnType<typeof useEditor>>;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
      h1: current.isActive("heading", { level: 1 }),
      h2: current.isActive("heading", { level: 2 }),
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      underline: current.isActive("underline"),
      strike: current.isActive("strike"),
      bullet: current.isActive("bulletList"),
      ordered: current.isActive("orderedList"),
      tasks: current.isActive("taskList"),
      quote: current.isActive("blockquote"),
      codeBlock: current.isActive("codeBlock"),
    }),
  });

  return (
    <div
      role="toolbar"
      aria-label="Document formatting"
      className="border-border bg-sunken flex flex-wrap items-center gap-0.5 border-b p-1.5"
    >
      <Tool
        label="Undo"
        disabled={!state.canUndo}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 />
      </Tool>
      <Tool
        label="Redo"
        disabled={!state.canRedo}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 />
      </Tool>
      <Rule />
      <Tool
        label="Heading 1"
        active={state.h1}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 />
      </Tool>
      <Tool
        label="Heading 2"
        active={state.h2}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 />
      </Tool>
      <Rule />
      <Tool
        label="Bold"
        active={state.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold />
      </Tool>
      <Tool
        label="Italic"
        active={state.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic />
      </Tool>
      <Tool
        label="Underline"
        active={state.underline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline />
      </Tool>
      <Tool
        label="Strikethrough"
        active={state.strike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough />
      </Tool>
      <Rule />
      <Tool
        label="Bullet list"
        active={state.bullet}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List />
      </Tool>
      <Tool
        label="Numbered list"
        active={state.ordered}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered />
      </Tool>
      <Tool
        label="To-do list"
        active={state.tasks}
        onClick={() =>
          editor.chain().focus().toggleList("taskList", "taskItem").run()
        }
      >
        <ListChecks />
      </Tool>
      <Tool
        label="Quote"
        active={state.quote}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote />
      </Tool>
      <Tool
        label="Code block"
        active={state.codeBlock}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <Code2 />
      </Tool>
      <Tool
        label="Divider"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        <Minus />
      </Tool>
      <Rule />
      <Tool
        label="Clear formatting"
        onClick={() =>
          editor.chain().focus().unsetAllMarks().clearNodes().run()
        }
      >
        <RemoveFormatting />
      </Tool>
      <span className="text-muted-foreground ml-auto hidden px-2 text-xs sm:inline">
        Type / for blocks
      </span>
    </div>
  );
}

function DocumentCounter({
  editor,
}: {
  editor: NonNullable<ReturnType<typeof useEditor>>;
}) {
  const counts = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      words: current.storage.characterCount.words(),
      characters: current.storage.characterCount.characters(),
    }),
  });
  return (
    <div className="border-border text-muted-foreground flex justify-end gap-1 border-t px-3 py-2 text-xs">
      <span>{counts.words.toLocaleString()} words</span>
      <span aria-hidden="true">·</span>
      <span>{counts.characters.toLocaleString()} characters</span>
    </div>
  );
}

function Tool({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactElement<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-35",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-panel hover:text-foreground",
        "[&_svg]:size-4",
      )}
    >
      {children}
    </button>
  );
}

function Rule() {
  return <span className="bg-border mx-1 h-5 w-px" aria-hidden="true" />;
}
