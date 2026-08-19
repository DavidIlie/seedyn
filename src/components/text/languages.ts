export const TEXT_LANGUAGES = [
  ["plaintext", "Plain text"],
  ["typescript", "TypeScript"],
  ["tsx", "TSX"],
  ["javascript", "JavaScript"],
  ["json", "JSON"],
  ["html", "HTML"],
  ["css", "CSS"],
  ["markdown", "Markdown"],
  ["python", "Python"],
  ["rust", "Rust"],
  ["sql", "SQL"],
  ["bash", "Shell"],
  ["yaml", "YAML"],
  ["xml", "XML"],
] as const;

export type TextLanguage = (typeof TEXT_LANGUAGES)[number][0];

const EXTENSION_LANGUAGE: Record<string, TextLanguage> = {
  bash: "bash",
  css: "css",
  htm: "html",
  html: "html",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  md: "markdown",
  mdx: "markdown",
  py: "python",
  rs: "rust",
  sh: "bash",
  sql: "sql",
  ts: "typescript",
  tsx: "tsx",
  txt: "plaintext",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
};

export function languageFromFilename(filename: string): TextLanguage {
  const extension = filename.trim().toLowerCase().split(".").at(-1) ?? "";
  return EXTENSION_LANGUAGE[extension] ?? "plaintext";
}

export function isTextLanguage(value: string): value is TextLanguage {
  return TEXT_LANGUAGES.some(([language]) => language === value);
}
