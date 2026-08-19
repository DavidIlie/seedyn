"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Code2, Download, FileText, FileUp, Save } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import {
  GuardedLink,
  useNavigationBlocker,
} from "~/components/navigation/navigation-blocker";
import {
  buttonPrimary,
  buttonQuiet,
  inputBase,
  labelBase,
} from "~/components/ui/styles";

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
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ComposerMode>("code");
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

  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_TEXT_BYTES) {
      setError("That file is larger than the 16 MB limit.");
      return;
    }
    if (dirty && !window.confirm("Replace the current draft with this file?"))
      return;
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
      <div
        role="tablist"
        aria-label="Editor type"
        className="border-border bg-sunken mb-5 inline-flex rounded-xl border p-1"
      >
        <ModeButton
          selected={mode === "code"}
          onClick={() => setMode("code")}
          icon={Code2}
        >
          Code
        </ModeButton>
        <ModeButton
          selected={mode === "document"}
          onClick={() => setMode("document")}
          icon={FileText}
        >
          Document
        </ModeButton>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <label className="min-w-0 flex-1">
          <span className={labelBase}>Filename</span>
          <input
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
            className={`${inputBase} mt-1 font-mono`}
            maxLength={255}
            spellCheck={false}
          />
        </label>
        {mode === "code" ? (
          <label className="md:w-44">
            <span className={labelBase}>Language</span>
            <select
              value={code.language}
              onChange={(event) => {
                setCode((current) => ({
                  ...current,
                  language: event.target.value as TextLanguage,
                }));
                edit();
              }}
              className={`${inputBase} mt-1`}
            >
              {TEXT_LANGUAGES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
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
            onChange={(event) => void pickFile(event)}
          />
          <button
            type="button"
            className={buttonQuiet}
            onClick={() => fileInput.current?.click()}
          >
            <FileUp className="size-4" aria-hidden="true" />{" "}
            {mode === "document" ? "Import Markdown" : "Pick file"}
          </button>
          {mode === "document" ? (
            <button
              type="button"
              className={buttonQuiet}
              onClick={exportMarkdown}
            >
              <Download className="size-4" aria-hidden="true" /> Export .md
            </button>
          ) : null}
          <button
            type="button"
            className={buttonPrimary}
            disabled={submitting}
            onClick={() => void submit()}
          >
            <Save className="size-4" aria-hidden="true" />{" "}
            {submitting
              ? "Creating…"
              : mode === "document"
                ? "Create document"
                : "Create"}
          </button>
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
    </div>
  );
}

function ModeButton({
  selected,
  onClick,
  icon: Icon,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  icon: typeof Code2;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${selected ? "bg-panel text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
    >
      <Icon className="size-4" aria-hidden="true" />
      {children}
    </button>
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
