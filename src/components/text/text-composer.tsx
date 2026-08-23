"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Code2, Download, FileText, FileUp, Save } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import {
  GuardedLink,
  useNavigationBlocker,
} from "~/components/navigation/navigation-blocker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";

import {
  documentToMarkdown,
  EMPTY_DOCUMENT,
  parseMarkdownDocument,
} from "./document-format";
import {
  isTextLanguage,
  languageFromFilename,
  TEXT_LANGUAGES,
  type TextLanguage,
} from "./languages";

const DRAFT_KEY = "seedyn:text-draft:v2";
const LEGACY_DRAFT_KEY = "seedyn:text-draft:v1";
const MAX_TEXT_BYTES = 16 * 1024 * 1024;
const EMPTY_DOCUMENT_VALUE = JSON.stringify(EMPTY_DOCUMENT);

const CodeEditor = dynamic(
  () => import("./code-editor").then((module) => module.CodeEditor),
  { ssr: false, loading: () => <EditorLoading label="code" /> },
);

const DocumentEditor = dynamic(
  () => import("./document-editor").then((module) => module.DocumentEditor),
  { ssr: false, loading: () => <EditorLoading label="document" /> },
);

type ComposerMode = "code" | "document";
type CodeDraft = {
  filename: string;
  language: TextLanguage;
  content: string;
};
type DocumentDraft = { filename: string; content: string };
type Draft = {
  version: 2;
  mode: ComposerMode;
  code: CodeDraft;
  document: DocumentDraft;
};

const INITIAL_CODE: CodeDraft = {
  filename: "untitled.txt",
  language: "plaintext",
  content: "",
};
const INITIAL_DOCUMENT: DocumentDraft = {
  filename: "untitled.md",
  content: EMPTY_DOCUMENT_VALUE,
};

function bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isMode(value: unknown): value is ComposerMode {
  return value === "code" || value === "document";
}

export function TextComposer() {
  const router = useRouter();
  const { setBlocked } = useNavigationBlocker();
  const filenameFieldId = useId();
  const languageFieldId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ComposerMode>("code");
  const [pendingImport, setPendingImport] = useState<File | null>(null);
  const [code, setCode] = useState<CodeDraft>(INITIAL_CODE);
  const [document, setDocument] = useState<DocumentDraft>(INITIAL_DOCUMENT);
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("Drafts are saved in this browser.");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DRAFT_KEY);
      if (stored) {
        const draft = JSON.parse(stored) as Partial<Draft>;
        if (draft.version === 2 && isMode(draft.mode)) {
          setMode(draft.mode);
          if (draft.code && isTextLanguage(draft.code.language)) {
            setCode(draft.code);
          }
          if (
            draft.document &&
            typeof draft.document.filename === "string" &&
            typeof draft.document.content === "string"
          ) {
            setDocument(draft.document);
          }
          setDirty(true);
          setMessage("Recovered your browser draft.");
          return;
        }
      }

      const legacy = window.localStorage.getItem(LEGACY_DRAFT_KEY);
      if (legacy) {
        const draft = JSON.parse(legacy) as Partial<CodeDraft>;
        setCode({
          filename:
            typeof draft.filename === "string"
              ? draft.filename
              : INITIAL_CODE.filename,
          language:
            typeof draft.language === "string" && isTextLanguage(draft.language)
              ? draft.language
              : INITIAL_CODE.language,
          content: typeof draft.content === "string" ? draft.content : "",
        });
        setDirty(true);
        setMessage("Recovered your browser draft.");
      }
    } catch {
      // A malformed or unavailable local store should not block the editor.
    }
  }, []);

  useEffect(() => {
    if (!dirty) return undefined;
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ version: 2, mode, code, document } satisfies Draft),
        );
        window.localStorage.removeItem(LEGACY_DRAFT_KEY);
        setMessage("Draft saved in this browser.");
      } catch {
        setMessage("Browser draft storage is unavailable.");
      }
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [code, dirty, document, mode]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty || submitting) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, submitting]);

  useEffect(() => {
    setBlocked(dirty && !submitting);
    return () => setBlocked(false);
  }, [dirty, setBlocked, submitting]);

  const submit = useCallback(async () => {
    if (submitting) return;
    const normalizedName = (
      mode === "code" ? code.filename : document.filename
    ).trim();
    if (!normalizedName) {
      setError("Enter a filename.");
      return;
    }

    let bodyContent: string;
    try {
      if (mode === "document") {
        bodyContent = documentToMarkdown(
          JSON.parse(document.content) as typeof EMPTY_DOCUMENT,
        );
      } else {
        bodyContent = code.content;
      }
    } catch {
      setError(
        "The document draft is malformed. Reload it from Markdown or start a new document.",
      );
      return;
    }

    if (bytes(bodyContent) > MAX_TEXT_BYTES) {
      setError("This item is larger than the 16 MB limit.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(mode === "document" ? "Creating document…" : "Creating text…");
    try {
      const body = new FormData();
      body.append(
        "file",
        new Blob([bodyContent], { type: "text/plain;charset=utf-8" }),
        normalizedName,
      );
      body.append("kind", "text");
      body.append("filename", normalizedName);
      body.append(
        "textLanguage",
        mode === "document" ? "document" : code.language,
      );
      const response = await fetch("/api/uploads", {
        method: "POST",
        body,
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => null)) as {
        id?: string;
        url?: string;
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(
          payload?.error?.message ?? "The item could not be created.",
        );
      }
      window.localStorage.removeItem(DRAFT_KEY);
      window.localStorage.removeItem(LEGACY_DRAFT_KEY);
      setDirty(false);
      if (payload?.id) router.push(`/uploads/${payload.id}`);
      else if (payload?.url) window.location.assign(payload.url);
      else router.push("/texts");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The item could not be created.",
      );
      setMessage("Draft kept in this browser.");
      setSubmitting(false);
    }
  }, [code, document, mode, router, submitting]);

  useEffect(() => {
    const saveShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void submit();
      }
    };
    window.addEventListener("keydown", saveShortcut);
    return () => window.removeEventListener("keydown", saveShortcut);
  }, [submit]);

  function edit() {
    setDirty(true);
    setMessage("Saving draft…");
    setError(null);
  }

  function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_TEXT_BYTES) {
      setError("That file is larger than the 16 MB limit.");
      return;
    }
    // Importing over unsaved work is destructive, so it asks first — through
    // the same alert dialog every other irreversible action uses. This was a
    // `window.confirm`, which cannot be styled, cannot be reached by the
    // Playwright flow without a dialog handler, and blocks the main thread.
    if (dirty) {
      setPendingImport(file);
      return;
    }
    void loadFile(file);
  }

  async function loadFile(file: File) {
    try {
      const next = await file.text();
      if (mode === "document") {
        const parsed = parseMarkdownDocument(next);
        setDocument({
          filename: file.name.replace(/\.(?:markdown|txt)$/i, ".md"),
          content: JSON.stringify(parsed),
        });
      } else {
        setCode({
          filename: file.name || "untitled.txt",
          language: languageFromFilename(file.name),
          content: next,
        });
      }
      edit();
      setMessage(`Loaded ${file.name}.`);
    } catch {
      setError(
        mode === "document"
          ? "That file could not be parsed as Markdown."
          : "That file could not be read as UTF-8 text.",
      );
    }
  }

  function exportMarkdown() {
    try {
      const markdown = documentToMarkdown(JSON.parse(document.content));
      const url = URL.createObjectURL(
        new Blob([markdown], { type: "text/markdown" }),
      );
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = document.filename.endsWith(".md")
        ? document.filename
        : `${document.filename}.md`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("The current document could not be exported.");
    }
  }

  const filename = mode === "code" ? code.filename : document.filename;
  const payloadBytes =
    mode === "code" ? bytes(code.content) : bytes(document.content);

  return (
    <div className="pb-10">
      <ToggleGroup
        type="single"
        variant="segmented"
        value={mode}
        // Radix reports "" when the pressed item is already selected. There is
        // no "no editor" state, so re-pressing the current mode does nothing.
        onValueChange={(next) => {
          if (isMode(next)) setMode(next);
        }}
        aria-label="Editor type"
        className="mb-5"
      >
        <ToggleGroupItem value="code">
          <Code2 className="size-4" aria-hidden="true" />
          Code
        </ToggleGroupItem>
        <ToggleGroupItem value="document">
          <FileText className="size-4" aria-hidden="true" />
          Document
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="min-w-0 flex-1">
          <Label htmlFor={filenameFieldId}>Filename</Label>
          <Input
            id={filenameFieldId}
            value={filename}
            onChange={(event) => {
              if (mode === "code") {
                setCode((current) => ({
                  ...current,
                  filename: event.target.value,
                  language: languageFromFilename(event.target.value),
                }));
              } else {
                setDocument((current) => ({
                  ...current,
                  filename: event.target.value,
                }));
              }
              edit();
            }}
            className="mt-1 font-mono"
            maxLength={255}
            spellCheck={false}
          />
        </div>
        {mode === "code" ? (
          <div className="md:w-44">
            <Label htmlFor={languageFieldId}>Language</Label>
            <Select
              value={code.language}
              onValueChange={(next) => {
                // `isTextLanguage` is the narrowing guard the union already
                // ships, so the listbox value never needs to be asserted.
                if (!isTextLanguage(next)) return;
                setCode((current) => ({ ...current, language: next }));
                edit();
              }}
            >
              <SelectTrigger id={languageFieldId} className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEXT_LANGUAGES.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInput}
            type="file"
            accept={
              mode === "document"
                ? ".md,.markdown,.txt,text/markdown,text/plain"
                : "text/*,.js,.jsx,.ts,.tsx,.json,.md,.py,.rs,.sql,.sh,.yaml,.yml,.xml"
            }
            className="sr-only"
            onChange={pickFile}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInput.current?.click()}
          >
            <FileUp className="size-4" aria-hidden="true" />
            {mode === "document" ? "Import Markdown" : "Pick file"}
          </Button>
          {mode === "document" ? (
            <Button type="button" variant="outline" onClick={exportMarkdown}>
              <Download className="size-4" aria-hidden="true" />
              Export .md
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={submitting}
            onClick={() => void submit()}
          >
            <Save className="size-4" aria-hidden="true" />
            {submitting
              ? "Creating…"
              : mode === "document"
                ? "Create document"
                : "Create"}
          </Button>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="border-danger bg-danger/5 text-danger mt-4 rounded-lg border px-3 py-2 text-sm"
        >
          {error}
        </div>
      ) : null}

      <div className="border-border bg-panel mt-4 overflow-hidden rounded-xl border">
        {mode === "code" ? (
          <CodeEditor
            value={code.content}
            language={code.language}
            onChange={(content) => {
              setCode((current) => ({ ...current, content }));
              edit();
            }}
          />
        ) : (
          <DocumentEditor
            value={document.content}
            onChange={(content) => {
              setDocument((current) => ({ ...current, content }));
              edit();
            }}
          />
        )}
        <div className="border-border text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 font-mono text-xs">
          <span>{payloadBytes.toLocaleString()} draft bytes · UTF-8</span>
          <span role="status" aria-live="polite">
            {message}
          </span>
        </div>
      </div>

      <p className="text-muted-foreground mt-3 text-sm">
        <GuardedLink href="/texts" className="hover:text-foreground">
          Cancel and return to texts
        </GuardedLink>
        <span aria-hidden="true"> · </span>Press Ctrl/⌘ S to create.
      </p>

      <AlertDialog
        open={pendingImport !== null}
        onOpenChange={(open) => {
          if (!open) setPendingImport(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the current draft?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingImport?.name ?? "This file"} replaces everything in the
              editor. The draft it overwrites has not been published, so it
              cannot be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my draft</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const file = pendingImport;
                setPendingImport(null);
                if (file) void loadFile(file);
              }}
            >
              Replace draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EditorLoading({ label }: { label: string }) {
  return (
    <div
      aria-label={`Loading ${label} editor`}
      className="bg-sunken min-h-96 animate-pulse"
    />
  );
}
