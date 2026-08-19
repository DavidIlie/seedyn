import { openAsBlob } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { CliError } from "./errors.mjs";

const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;

export async function uploadFile(input) {
  const source = await uploadSource(input.file, input.filename);
  const form = new FormData();
  form.append("file", source.blob, source.filename);
  append(form, "kind", input.kind === "auto" ? undefined : input.kind);
  append(form, "textLanguage", input.language);
  append(form, "slug", input.slug);
  append(form, "mediaDomain", input.domain);
  if (input.renderHtml) form.append("renderHtml", "true");

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort("timeout"),
    input.timeoutMs,
  );
  timeout.unref();
  const interrupt = () => controller.abort("interrupt");
  process.once("SIGINT", interrupt);

  let response;
  let body;
  try {
    response = await fetch(new URL("/api/upload", input.apiUrl), {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${input.apiKey}`,
        "User-Agent": `seedyn-cli/${input.version}`,
      },
      body: form,
      signal: controller.signal,
    });
    body = await readJsonResponse(response);
  } catch (error) {
    if (controller.signal.reason === "timeout") {
      throw new CliError(
        `Upload timed out after ${input.timeoutMs / 1000} seconds.`,
      );
    }
    if (controller.signal.reason === "interrupt") {
      throw new CliError("Upload cancelled.");
    }
    throw new CliError("Seedyn could not be reached.", { cause: error });
  } finally {
    clearTimeout(timeout);
    process.removeListener("SIGINT", interrupt);
  }

  if (!response.ok) {
    const message =
      typeof body?.error?.message === "string"
        ? body.error.message
        : `Seedyn rejected the upload (HTTP ${response.status}).`;
    const requestId =
      typeof body?.error?.requestId === "string"
        ? ` Request: ${body.error.requestId}`
        : "";
    throw new CliError(`${message}${requestId}`);
  }
  if (!body || typeof body.url !== "string") {
    throw new CliError("Seedyn returned an unreadable upload response.");
  }

  let url;
  try {
    url = new URL(body.url);
  } catch {
    throw new CliError("Seedyn returned an invalid public URL.");
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    (url.protocol === "http:" && !isLocalHostname(url.hostname)) ||
    url.username ||
    url.password
  ) {
    throw new CliError("Seedyn returned an unsafe public URL.");
  }

  return {
    id: typeof body.id === "string" ? body.id : null,
    kind: typeof body.kind === "string" ? body.kind : null,
    contentType: typeof body.contentType === "string" ? body.contentType : null,
    disposition: typeof body.disposition === "string" ? body.disposition : null,
    renderedHtml: body.renderedHtml === true,
    url: url.toString(),
    filename: source.filename,
  };
}

function isLocalHostname(hostname) {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

export function copyUrl(value) {
  const attempts =
    process.platform === "darwin"
      ? [["pbcopy", []]]
      : process.platform === "win32"
        ? [["clip.exe", []]]
        : [
            ["wl-copy", []],
            ["xclip", ["-selection", "clipboard"]],
            ["xsel", ["--clipboard", "--input"]],
          ];
  for (const [command, args] of attempts) {
    const result = spawnSync(command, args, {
      input: value,
      encoding: "utf8",
      stdio: ["pipe", "ignore", "ignore"],
      timeout: 5_000,
      windowsHide: true,
    });
    if (!result.error && result.status === 0) return true;
  }
  return false;
}

export function openUrl(value) {
  const target = new URL(value);
  let command;
  let args;
  if (process.platform === "darwin") {
    command = "open";
    args = [target.toString()];
  } else if (process.platform === "win32") {
    command = "rundll32.exe";
    args = ["url.dll,FileProtocolHandler", target.toString()];
  } else {
    command = "xdg-open";
    args = [target.toString()];
  }
  const result = spawnSync(command, args, {
    stdio: "ignore",
    timeout: 5_000,
    windowsHide: true,
  });
  return !result.error && result.status === 0;
}

async function uploadSource(file, explicitFilename) {
  if (file === "-") {
    if (!explicitFilename) {
      throw new CliError("Uploading stdin requires --filename <name>.");
    }
    const bytes = await readStdin();
    return { blob: new Blob(bytes), filename: safeFilename(explicitFilename) };
  }

  const resolved = path.resolve(file);
  let status;
  try {
    status = await stat(resolved);
  } catch (error) {
    throw new CliError(`File does not exist: ${resolved}`, { cause: error });
  }
  if (!status.isFile()) throw new CliError(`Not a regular file: ${resolved}`);
  if (status.size > MAX_UPLOAD_BYTES) {
    throw new CliError("That file exceeds Seedyn's 64 MiB upload limit.");
  }
  return {
    blob: await openAsBlob(resolved),
    filename: safeFilename(explicitFilename || path.basename(resolved)),
  };
}

async function readStdin() {
  if (process.stdin.isTTY) {
    throw new CliError("No stdin data was provided.");
  }
  const chunks = [];
  let received = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk);
    received += bytes.byteLength;
    if (received > MAX_UPLOAD_BYTES) {
      throw new CliError("Stdin exceeds Seedyn's 64 MiB upload limit.");
    }
    chunks.push(bytes);
  }
  return chunks;
}

function safeFilename(value) {
  const filename = String(value).trim();
  if (
    !filename ||
    filename === "." ||
    filename === ".." ||
    /[\\/\0\r\n]/u.test(filename)
  ) {
    throw new CliError(
      "--filename must be a plain filename without path separators.",
    );
  }
  if (Buffer.byteLength(filename, "utf8") > 255) {
    throw new CliError("The filename is longer than 255 UTF-8 bytes.");
  }
  return filename;
}

function append(form, name, value) {
  if (typeof value === "string" && value.length > 0) form.append(name, value);
}

async function readJsonResponse(response) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new CliError("Seedyn returned an unexpectedly large response.");
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new CliError("Seedyn returned an unexpectedly large response.");
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
