# Seedyn CLI

Upload any file to Seedyn and print its permanent public URL. The package has
no runtime dependencies and requires Node.js 22.12 or newer.

## Setup

Open Seedyn in your browser, approve the requested upload scopes, and let the
CLI save the new key:

```sh
npx seedyn auth login
```

The browser encrypts the new credential to the waiting CLI process. The server
cannot recover it from the login request. To store an existing key instead, run
`npx seedyn auth set` and paste it into the hidden prompt.

Credentials are written to `$XDG_CONFIG_HOME/seedyn/config.json`, or
`~/.config/seedyn/config.json` when `XDG_CONFIG_HOME` is unset. The directory is
mode `0700` and the file is mode `0600`. `SEEDYN_CONFIG_PATH` can select a
different absolute file.

For CI, keep credentials outside the repository:

```sh
export SEEDYN_API_KEY='sdn_live_…'
```

Authentication precedence is `--api-key`, then `SEEDYN_API_KEY`, then the
owner-only config file. API URL precedence is `--api-url`, then
`SEEDYN_API_URL`, then the config file, then `https://seedyn.dave.tips`.
Passing a secret on the command line can expose it to shell history and process
inspection; prefer the environment or `seedyn auth set`.

## Self-hosted Seedyn

Save the application origin once, then use the normal login flow:

```sh
npx seedyn config set api-url https://seedyn.example.com
npx seedyn config get api-url
npx seedyn auth login
```

The origin must use HTTPS. HTTP is accepted for `localhost` during development.
For a one-off command, pass `--api-url`. In CI, set `SEEDYN_API_URL`.

## Upload

The shortest form treats the first argument as a file:

```sh
npx seedyn ./report.pdf
```

The explicit form exposes all upload controls:

```sh
npx seedyn upload ./report.pdf --copy
npx seedyn upload ./page.html --render-html --open
npx seedyn upload ./image.png --slug launch-shot --domain gurt
```

`--render-html` is an explicit opt-in. Seedyn verifies a non-empty UTF-8 HTML
document, stores it as `text/html`, and serves it inline only on a configured
public media domain. Uploaded scripts, forms, frames, embedded objects, and
network requests remain disabled by the response sandbox. Without the flag,
HTML is an ordinary attachment.

Agents can upload stdin by naming the resulting file:

```sh
generate-report | npx seedyn upload - --filename report.html --render-html
```

Useful options:

- `--copy` copies the URL using the operating system clipboard command.
- `--open` opens the URL using the operating system URL handler.
- `--json` prints a machine-readable response.
- `--quiet` prints only the URL.
- `--slug <slug>` requests a readable public slug.
- `--domain <id>` chooses a configured media-domain identifier.
- `--kind <auto|image|file|text>` supplies the server classification hint.
- `--language <language>` supplies the text-language hint.
- `--api-url <origin>` targets a local or custom Seedyn instance.

The server always classifies the uploaded bytes and enforces the API key scope.
Files are limited to 64 MiB; rendered HTML, images, and text are limited to
16 MiB.

## Attribution

The command workflow is inspired by the MIT-licensed
[`postplan@0.0.4`](https://www.jsdelivr.com/package/npm/postplan). See
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) for attribution and the
retained license.
