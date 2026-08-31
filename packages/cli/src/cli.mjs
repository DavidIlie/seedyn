import { createRequire } from "node:module";
import { parseArgs } from "node:util";

import {
  configPath,
  displayApiKey,
  readConfig,
  removeAuthentication,
  resolveAuthentication,
  saveApiUrl,
  saveAuthentication,
  validateApiKey,
  validateApiUrl,
} from "./config.mjs";
import { CliError } from "./errors.mjs";
import { browserLogin } from "./browser-auth.mjs";
import { copyUrl, openUrl, uploadFile } from "./upload.mjs";

const { version: VERSION } = createRequire(import.meta.url)("../package.json");

export async function run(arguments_) {
  const args = [...arguments_];
  const first = args[0];
  if (!first || first === "help" || first === "--help" || first === "-h") {
    console.log(HELP);
    return;
  }
  if (first === "version" || first === "--version" || first === "-V") {
    console.log(VERSION);
    return;
  }
  if (first === "auth") {
    await authCommand(args.slice(1));
    return;
  }
  if (first === "config") {
    await configCommand(args.slice(1));
    return;
  }
  await uploadCommand(first === "upload" ? args.slice(1) : args);
}

async function authCommand(args) {
  const action = args[0] || "help";
  if (action === "help" || action === "--help" || action === "-h") {
    console.log(AUTH_HELP);
    return;
  }

  if (action === "set") {
    const { values, positionals } = parseArgs({
      args: args.slice(1),
      allowPositionals: true,
      strict: true,
      options: {
        "api-key": { type: "string" },
        "api-url": { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    });
    if (values.help) {
      console.log(AUTH_SET_HELP);
      return;
    }
    if (positionals.length > 1)
      throw new CliError("auth set accepts at most one API key.");
    const key = validateApiKey(
      values["api-key"] || positionals[0] || (await readSecret()),
    );
    const apiUrl = values["api-url"]
      ? validateApiUrl(values["api-url"])
      : undefined;
    const result = await saveAuthentication({ apiKey: key, apiUrl });
    console.log(`Seedyn credentials saved to ${result.file}`);
    console.log(`API key: ${displayApiKey(key)}`);
    console.log(
      `API URL: ${result.value.apiUrl || "https://seedyn.dave.tips"}`,
    );
    return;
  }

  if (action === "login") {
    const { values, positionals } = parseArgs({
      args: args.slice(1),
      allowPositionals: true,
      strict: true,
      options: {
        "api-url": { type: "string" },
        "no-open": { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    });
    if (values.help) {
      console.log(AUTH_LOGIN_HELP);
      return;
    }
    if (positionals.length > 0) {
      throw new CliError("auth login takes no arguments.");
    }
    const apiUrl = validateApiUrl(
      values["api-url"] ||
        process.env.SEEDYN_API_URL ||
        "https://seedyn.dave.tips",
    );
    const key = validateApiKey(
      await browserLogin({
        apiUrl,
        version: VERSION,
        openBrowser: values["no-open"] ? () => false : openUrl,
      }),
    );
    const result = await saveAuthentication({ apiKey: key, apiUrl });
    console.log(`Seedyn credentials saved to ${result.file}`);
    console.log(`API key: ${displayApiKey(key)}`);
    return;
  }

  if (action === "remove") {
    if (args.length > 1) throw new CliError("auth remove takes no arguments.");
    console.log(
      `Removed the stored API key from ${await removeAuthentication()}`,
    );
    return;
  }

  if (action === "status") {
    if (args.length > 1) throw new CliError("auth status takes no arguments.");
    const config = await readConfig();
    console.log(`Config: ${configPath()}`);
    console.log(`API URL: ${config.apiUrl || "https://seedyn.dave.tips"}`);
    console.log(
      `Stored API key: ${config.apiKey ? displayApiKey(config.apiKey) : "not configured"}`,
    );
    console.log(
      `Environment API key: ${process.env.SEEDYN_API_KEY ? "configured" : "not configured"}`,
    );
    return;
  }

  throw new CliError(`Unknown auth command: ${action}`);
}

async function configCommand(args) {
  const action = args[0] || "help";
  if (action === "help" || action === "--help" || action === "-h") {
    console.log(CONFIG_HELP);
    return;
  }

  if (action === "set" && args[1] === "api-url") {
    if (args.length !== 3) {
      throw new CliError("Usage: seedyn config set api-url <origin>");
    }
    const result = await saveApiUrl(args[2]);
    console.log(`API URL saved to ${result.file}`);
    console.log(`API URL: ${result.value.apiUrl}`);
    return;
  }

  if (action === "get" && args[1] === "api-url") {
    if (args.length !== 2) {
      throw new CliError("Usage: seedyn config get api-url");
    }
    const config = await readConfig();
    console.log(config.apiUrl || "https://seedyn.dave.tips");
    return;
  }

  throw new CliError(`Unknown config command: ${args.join(" ")}`);
}

async function uploadCommand(args) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      "api-key": { type: "string" },
      "api-url": { type: "string" },
      copy: { type: "boolean", short: "c" },
      domain: { type: "string", short: "d" },
      filename: { type: "string" },
      help: { type: "boolean", short: "h" },
      json: { type: "boolean" },
      kind: { type: "string", default: "auto" },
      language: { type: "string" },
      open: { type: "boolean", short: "o" },
      quiet: { type: "boolean", short: "q" },
      render: { type: "boolean" },
      "render-html": { type: "boolean" },
      slug: { type: "string", short: "s" },
      timeout: { type: "string", default: "120" },
    },
  });
  if (values.help) {
    console.log(UPLOAD_HELP);
    return;
  }
  if (positionals.length !== 1) {
    throw new CliError("Choose exactly one file, or use - for stdin.");
  }
  const kind = values.kind;
  if (!new Set(["auto", "image", "file", "text"]).has(kind)) {
    throw new CliError("--kind must be auto, image, file, or text.");
  }
  const timeoutSeconds = Number(values.timeout);
  if (
    !Number.isInteger(timeoutSeconds) ||
    timeoutSeconds < 1 ||
    timeoutSeconds > 600
  ) {
    throw new CliError(
      "--timeout must be a whole number from 1 to 600 seconds.",
    );
  }
  if (values.json && values.quiet) {
    throw new CliError("Choose either --json or --quiet, not both.");
  }

  const auth = await resolveAuthentication({
    apiKey: values["api-key"],
    apiUrl: values["api-url"],
  });
  const result = await uploadFile({
    ...auth,
    version: VERSION,
    file: positionals[0],
    filename: values.filename,
    renderHtml: Boolean(values["render-html"] || values.render),
    slug: values.slug,
    domain: values.domain,
    kind,
    language: values.language,
    timeoutMs: timeoutSeconds * 1000,
  });

  const notices = [];
  if (values.copy)
    notices.push(
      copyUrl(result.url)
        ? "Copied URL."
        : "Could not access a clipboard command.",
    );
  if (values.open)
    notices.push(
      openUrl(result.url) ? "Opened URL." : "Could not open the URL handler.",
    );

  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (values.quiet) {
    console.log(result.url);
    return;
  }
  console.log(`Uploaded ${result.filename}`);
  console.log(`URL: ${result.url}`);
  if (result.renderedHtml) console.log("Mode: sandboxed HTML page");
  for (const notice of notices) console.log(notice);
}

async function readSecret() {
  if (!process.stdin.isTTY) {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of process.stdin) {
      const value = Buffer.from(chunk);
      bytes += value.byteLength;
      if (bytes > 512) throw new CliError("The piped API key is too long.");
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8").trim();
  }

  return new Promise((resolve, reject) => {
    let value = "";
    const wasRaw = process.stdin.isRaw;
    const cleanup = () => {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode(wasRaw);
      process.stdin.pause();
      process.stderr.write("\n");
    };
    const onData = (chunk) => {
      for (const byte of Buffer.from(chunk)) {
        if (byte === 3) {
          cleanup();
          reject(new CliError("Authentication setup cancelled."));
          return;
        }
        if (byte === 4 && value.length === 0) {
          cleanup();
          reject(new CliError("No API key entered."));
          return;
        }
        if (byte === 10 || byte === 13) {
          cleanup();
          resolve(value);
          return;
        }
        if (byte === 8 || byte === 127) {
          value = value.slice(0, -1);
        } else if (byte >= 0x20 && byte <= 0x7e && value.length < 256) {
          value += String.fromCharCode(byte);
        }
      }
    };
    process.stderr.write("Seedyn API key: ");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

const HELP = `Seedyn ${VERSION}

Upload any file and receive its durable URL.

Usage:
  seedyn <file> [options]
  seedyn upload <file> [options]
  seedyn auth <login|set|status|remove>
  seedyn config <set|get> api-url

Examples:
  seedyn ./image.png --copy
  seedyn ./page.html --render-html --open
  seedyn upload - --filename report.html --render-html

Run seedyn upload --help for every upload option.`;

const UPLOAD_HELP = `Usage: seedyn upload <file|-> [options]

Options:
  -c, --copy                 Copy the resulting URL
  -o, --open                 Open the resulting URL
  --render-html, --render    Serve verified UTF-8 HTML as a sandboxed page
  -s, --slug <slug>          Request a custom public slug
  -d, --domain <id>          Choose a configured media-domain identifier
  --kind <kind>              auto, image, file, or text (default: auto)
  --language <language>      Text-language hint
  --filename <name>          Override the uploaded filename; required for stdin
  --json                     Print machine-readable JSON
  -q, --quiet                Print only the URL
  --timeout <seconds>        Upload timeout from 1 to 600 (default: 120)
  --api-url <origin>         Override the Seedyn application origin
  --api-key <key>            Override auth (prefer env/config; argv is visible)
  -h, --help                 Show this help`;

const AUTH_HELP = `Usage: seedyn auth <command>

Commands:
  login                      Create a key through the Seedyn website
  set [api-key]              Store a key with owner-only permissions
  status                     Show config and redacted credential status
  remove                     Remove the stored API key

Run "seedyn auth login" for the guided browser flow.`;

const CONFIG_HELP = `Usage: seedyn config <command>

Commands:
  set api-url <origin>       Save a self-hosted Seedyn application origin
  get api-url                Print the configured application origin`;

const AUTH_LOGIN_HELP = `Usage: seedyn auth login [options]

Options:
  --api-url <origin>         Use and save a custom Seedyn application origin
  --no-open                  Print the approval URL without opening a browser
  -h, --help                 Show this help`;

const AUTH_SET_HELP = `Usage: seedyn auth set [api-key] [options]

Options:
  --api-url <origin>         Save a custom Seedyn application origin
  --api-key <key>            Supply the key (prefer the hidden prompt)
  -h, --help                 Show this help`;
