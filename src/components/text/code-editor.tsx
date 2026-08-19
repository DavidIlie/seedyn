"use client";

import CodeMirror, { type Extension } from "@uiw/react-codemirror";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";

import type { TextLanguage } from "./languages";

function extensionFor(language: TextLanguage): Extension[] {
  switch (language) {
    case "typescript":
      return [javascript({ typescript: true })];
    case "tsx":
      return [javascript({ jsx: true, typescript: true })];
    case "javascript":
      return [javascript({ jsx: true })];
    case "json":
      return [json()];
    case "html":
    case "xml":
      return [html()];
    case "css":
      return [css()];
    case "markdown":
      return [markdown()];
    case "python":
      return [python()];
    case "rust":
      return [rust()];
    case "sql":
      return [sql()];
    default:
      return [];
  }
}

export function CodeEditor({
  value,
  language,
  onChange,
}: {
  value: string;
  language: TextLanguage;
  onChange: (value: string) => void;
}) {
  return (
    <CodeMirror
      value={value}
      height="min(60dvh, 42rem)"
      minHeight="24rem"
      extensions={extensionFor(language)}
      onChange={onChange}
      basicSetup={{
        autocompletion: false,
        bracketMatching: true,
        closeBrackets: true,
        foldGutter: true,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        indentOnInput: true,
        lineNumbers: true,
      }}
      aria-label="Text content"
      className="text-editor min-w-0 font-mono text-base md:text-sm"
    />
  );
}
