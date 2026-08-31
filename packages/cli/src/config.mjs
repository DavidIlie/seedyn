import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { CliError } from "./errors.mjs";

export const DEFAULT_API_URL = "https://seedyn.dave.tips";
const API_KEY_PATTERN = /^sdn_live_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{43}$/u;

export function validateApiKey(value) {
  const key = typeof value === "string" ? value.trim() : "";
  if (!API_KEY_PATTERN.test(key)) {
    throw new CliError("That is not a valid Seedyn API key.");
  }
  return key;
}

export function displayApiKey(value) {
  const key = validateApiKey(value);
  return `${key.slice(0, "sdn_live_".length + 8)}_…`;
}

export function validateApiUrl(value) {
  let url;
  try {
    url = new URL(String(value).trim());
  } catch {
    throw new CliError("The Seedyn API URL must be a valid origin.");
  }

  const local =
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new CliError(
      "The Seedyn API URL must be an HTTPS origin (HTTP is allowed only on localhost).",
    );
  }
  return url.origin;
}

export function configPath(environment = process.env) {
  const explicit = environment.SEEDYN_CONFIG_PATH?.trim();
  if (explicit) {
    if (!path.isAbsolute(explicit)) {
      throw new CliError("SEEDYN_CONFIG_PATH must be an absolute path.");
    }
    return explicit;
  }
  const xdg = environment.XDG_CONFIG_HOME?.trim();
  const root =
    xdg && path.isAbsolute(xdg) ? xdg : path.join(os.homedir(), ".config");
  return path.join(root, "seedyn", "config.json");
}

export async function readConfig(environment = process.env) {
  const file = configPath(environment);
  try {
    const status = await lstat(file);
    if (!status.isFile() || status.isSymbolicLink()) {
      throw new CliError(`Seedyn config is not a regular file: ${file}`);
    }
    if (process.platform !== "win32" && (status.mode & 0o077) !== 0) {
      throw new CliError(
        `Seedyn config permissions are too open: ${file}. Restrict it to mode 0600.`,
      );
    }
    const parsed = JSON.parse(await readFile(file, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    if (error instanceof CliError) throw error;
    throw new CliError(`Seedyn config is unreadable: ${file}`, {
      cause: error,
    });
  }
}

export async function resolveAuthentication(
  options = {},
  environment = process.env,
) {
  const config = await readConfig(environment);
  const apiUrl = validateApiUrl(
    options.apiUrl ||
      environment.SEEDYN_API_URL ||
      config.apiUrl ||
      DEFAULT_API_URL,
  );
  const candidate =
    options.apiKey || environment.SEEDYN_API_KEY || config.apiKey;
  if (!candidate) {
    throw new CliError(
      "Missing Seedyn API key. Run `seedyn auth login`, `seedyn auth set`, or set SEEDYN_API_KEY.",
    );
  }
  return { apiKey: validateApiKey(candidate), apiUrl };
}

export async function saveAuthentication(
  { apiKey, apiUrl },
  environment = process.env,
) {
  const existing = await readConfig(environment);
  const next = {
    ...existing,
    apiKey: validateApiKey(apiKey),
    ...(apiUrl ? { apiUrl: validateApiUrl(apiUrl) } : {}),
    updatedAt: new Date().toISOString(),
  };
  await writeConfig(next, environment);
  return { file: configPath(environment), value: next };
}

export async function removeAuthentication(environment = process.env) {
  const existing = await readConfig(environment);
  const { apiKey: _removed, ...next } = existing;
  await writeConfig(
    { ...next, updatedAt: new Date().toISOString() },
    environment,
  );
  return configPath(environment);
}

async function writeConfig(value, environment) {
  const file = configPath(environment);
  const directory = path.dirname(file);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const directoryStatus = await lstat(directory);
  if (!directoryStatus.isDirectory() || directoryStatus.isSymbolicLink()) {
    throw new CliError(`Seedyn config directory is unsafe: ${directory}`);
  }
  await chmod(directory, 0o700);

  const temporary = path.join(
    directory,
    `.config.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await chmod(temporary, 0o600);
    await rename(temporary, file);
    await chmod(file, 0o600);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw new CliError(`Could not write Seedyn config: ${file}`, {
      cause: error,
    });
  }
}
