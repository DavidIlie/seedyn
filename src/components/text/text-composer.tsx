"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { FileUp, Save } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import {
  buttonPrimary,
  buttonQuiet,
  inputBase,
  labelBase,
} from "~/components/ui/styles";
import {
  GuardedLink,
  useNavigationBlocker,
} from "~/components/navigation/navigation-blocker";

import {
  isTextLanguage,
  languageFromFilename,
  TEXT_LANGUAGES,
  type TextLanguage,
} from "./languages";

const DRAFT_KEY = "seedyn:text-draft:v1";
const MAX_TEXT_BYTES = 16 * 1024 * 1024;

const CodeEditor = dynamic(
  () => import("./code-editor").then((module) => module.CodeEditor),
  {
    ssr: false,
    loading: () => (
      <div
        aria-label="Loading code editor"
        className="bg-sunken min-h-96 animate-pulse"
      />
    ),
  },
);

type Draft = {
  filename: string;
  language: TextLanguage;
  content: string;
};

function bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function TextComposer() {
  const router = useRouter();
  const { setBlocked } = useNavigationBlocker();
  const fileInput = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState("untitled.txt");
  const [language, setLanguage] = useState<TextLanguage>("plaintext");
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("Drafts are saved in this browser.");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DRAFT_KEY);
      if (stored) {
        const draft = JSON.parse(stored) as Partial<Draft>;
        if (typeof draft.filename === "string") setFilename(draft.filename);
        if (typeof draft.content === "string") setContent(draft.content);
        if (
          typeof draft.language === "string" &&
          isTextLanguage(draft.language)
        ) {
          setLanguage(draft.language);
        }
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
          JSON.stringify({ filename, language, content } satisfies Draft),
        );
        setMessage("Draft saved in this browser.");
      } catch {
        setMessage("Browser draft storage is unavailable.");
      }
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [content, dirty, filename, language]);

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
    const normalizedName = filename.trim();
    if (!normalizedName) {
      setError("Enter a filename.");
      return;
    }
    const byteSize = bytes(content);
    if (byteSize > MAX_TEXT_BYTES) {
      setError("This text is larger than the 16 MB limit.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage("Creating text…");
    try {
      const body = new FormData();
      body.append(
        "file",
        new Blob([content], { type: "text/plain;charset=utf-8" }),
        normalizedName,
      );
      body.append("kind", "text");
      body.append("filename", normalizedName);
      body.append("textLanguage", language);
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
          payload?.error?.message ?? "The text could not be created.",
        );
      }
      window.localStorage.removeItem(DRAFT_KEY);
      setDirty(false);
      if (payload?.id) {
        router.push(`/uploads/${payload.id}`);
      } else if (payload?.url) {
        window.location.assign(payload.url);
      } else {
        router.push("/texts");
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The text could not be created.",
      );
      setMessage("Draft kept in this browser.");
      setSubmitting(false);
    }
  }, [content, filename, language, router, submitting]);

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

  function updateFilename(value: string) {
    setFilename(value);
    setLanguage(languageFromFilename(value));
    setDirty(true);
    setMessage("Saving draft…");
  }

  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_TEXT_BYTES) {
      setError("That file is larger than the 16 MB limit.");
      return;
    }
    if (
      dirty &&
      content &&
      !window.confirm("Replace the current draft with this file?")
    )
      return;
    try {
      const next = await file.text();
      setFilename(file.name || "untitled.txt");
      setLanguage(languageFromFilename(file.name));
      setContent(next);
      setDirty(true);
      setError(null);
      setMessage(`Loaded ${file.name}.`);
    } catch {
      setError("That file could not be read as UTF-8 text.");
    }
  }

  const byteSize = bytes(content);
  const lineCount = content.length === 0 ? 1 : content.split("\n").length;

  return (
    <div className="pb-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <label className="min-w-0 flex-1">
          <span className={labelBase}>Filename</span>
          <input
            value={filename}
            onChange={(event) => updateFilename(event.target.value)}
            className={`${inputBase} mt-1 font-mono`}
            maxLength={255}
            spellCheck={false}
          />
        </label>
        <label className="md:w-44">
          <span className={labelBase}>Language</span>
          <select
            value={language}
            onChange={(event) => {
              setLanguage(event.target.value as TextLanguage);
              setDirty(true);
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
        <div className="flex gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="text/*,.js,.jsx,.ts,.tsx,.json,.md,.py,.rs,.sql,.sh,.yaml,.yml,.xml"
            className="sr-only"
            onChange={(event) => void pickFile(event)}
          />
          <button
            type="button"
            className={buttonQuiet}
            onClick={() => fileInput.current?.click()}
          >
            <FileUp className="size-4" aria-hidden="true" /> Pick file
          </button>
          <button
            type="button"
            className={buttonPrimary}
            disabled={submitting}
            onClick={() => void submit()}
          >
            <Save className="size-4" aria-hidden="true" />{" "}
            {submitting ? "Creating…" : "Create"}
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
        <CodeEditor
          value={content}
          language={language}
          onChange={(value) => {
            setContent(value);
            setDirty(true);
            setMessage("Saving draft…");
          }}
        />
        <div className="border-border text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 font-mono text-xs">
          <span>
            {lineCount.toLocaleString()} lines · {byteSize.toLocaleString()}{" "}
            bytes · UTF-8
          </span>
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
