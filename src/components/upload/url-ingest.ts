import { TransportError } from "./transport";

/**
 * HTTPS URL ingest, performed entirely in the user's browser.
 *
 * The server never fetches a user-supplied URL. That is the whole point: a
 * server-side fetcher is an SSRF surface that would need DNS pinning,
 * private-range blocking before and after every redirect, and an allowlist
 * (`plans/spec/05-AUTH-AND-SECURITY.md`). Doing it here means the request
 * carries the user's own network position and no Seedyn credential, and that
 * CORS-hostile origins simply fail — visibly, with the reason named.
 *
 * There is no proxy fallback, and adding one is a separate design.
 */

/**
 * Mirrors `UPLOAD_LIMITS.generic` in `src/server/uploads/multipart.ts`. That
 * module cannot be imported here — it pulls in `node:crypto` and `node:fs` —
 * so the number is restated rather than shared. The server enforces it either
 * way; this only avoids streaming bytes that are already doomed.
 *
 * Images and text have a lower server ceiling (16 MiB) that the browser cannot
 * predict, because the kind comes from magic-byte classification, not from the
 * extension. Those are refused server-side and the message is surfaced.
 */
export const URL_INGEST_BYTE_CAP = 64 * 1024 * 1024;

function assertCredentialFreeHttpsUrl(
  url: URL,
  context: "initial" | "redirect",
): void {
  if (url.protocol !== "https:") {
    throw new TransportError(
      context === "initial" ? "insecure_url" : "insecure_redirect",
      context === "initial"
        ? "Only https:// URLs can be fetched by the browser."
        : "That URL redirected to a non-HTTPS address.",
    );
  }
  if (url.username || url.password) {
    throw new TransportError(
      context === "initial" ? "credentialed_url" : "unsafe_redirect",
      context === "initial"
        ? "URLs containing a username or password are not accepted."
        : "That URL redirected to an address containing credentials.",
    );
  }
}

function filenameFromUrl(url: URL): string {
  const last = url.pathname.split("/").filter(Boolean).at(-1);
  if (!last) return "download";
  const decoded = (() => {
    try {
      return decodeURIComponent(last);
    } catch {
      return last;
    }
  })();
  // Display name only: control and format characters plus path separators are
  // dropped so the value is safe to render. The server sanitises it again and
  // never derives an object key, route, or header from it.
  const safe = decoded
    .replace(/[\p{Cc}\p{Cf}/\\]/gu, "")
    .trim()
    .slice(0, 255);
  return safe || "download";
}

export function parseHttpsUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new TransportError("invalid_url", "That is not a valid URL.");
  }
  assertCredentialFreeHttpsUrl(url, "initial");
  return url;
}

export async function fetchUrlBytes(input: {
  url: URL;
  signal: AbortSignal;
  onProgress: (loaded: number, total: number | null) => void;
}): Promise<File> {
  // Keep this guard here as well as in parseHttpsUrl(): this exported function
  // must stay safe if another caller constructs a URL directly.
  assertCredentialFreeHttpsUrl(input.url, "initial");

  let response: Response;
  try {
    response = await fetch(input.url, {
      // No cookies, no Authorization, no Referer: this request must not carry
      // the user's identity anywhere.
      credentials: "omit",
      referrerPolicy: "no-referrer",
      mode: "cors",
      redirect: "follow",
      cache: "no-store",
      signal: input.signal,
    });
  } catch {
    if (input.signal.aborted) {
      throw new TransportError("cancelled", "Fetch cancelled.");
    }
    // CORS, mixed-content redirect blocking, DNS/network failures, and browser
    // policy rejection intentionally collapse to a TypeError. The platform
    // exposes no reliable distinction, so the message does not guess a cause.
    throw new TransportError(
      "blocked",
      "The browser blocked that fetch (often CORS, a non-HTTPS redirect, or network policy), or the address was unreachable. Download the file and choose it instead.",
    );
  }

  let finalUrl = input.url;
  if (response.url) {
    try {
      finalUrl = new URL(response.url);
    } catch {
      throw new TransportError(
        "unsafe_redirect",
        "The browser returned an invalid final address.",
      );
    }
  }
  // Fetch exposes only the final URL. The browser itself blocks mixed-content
  // redirect hops; we additionally enforce the final observable address.
  assertCredentialFreeHttpsUrl(finalUrl, "redirect");

  if (!response.ok) {
    throw new TransportError(
      "http_status",
      `That URL answered HTTP ${response.status}.`,
    );
  }

  const declared = Number(response.headers.get("content-length"));
  const total = Number.isFinite(declared) && declared > 0 ? declared : null;
  if (total !== null && total > URL_INGEST_BYTE_CAP) {
    throw new TransportError(
      "too_large",
      "That file is larger than the 64 MiB limit.",
    );
  }

  const contentType = (response.headers.get("content-type") ?? "")
    .split(";")[0]
    ?.trim()
    .toLowerCase();

  const body = response.body;
  if (!body) {
    throw new TransportError("blocked", "That response had no readable body.");
  }

  const reader = body.getReader();
  const chunks: BlobPart[] = [];
  let loaded = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      loaded += value.byteLength;
      if (loaded > URL_INGEST_BYTE_CAP) {
        // Stop reading rather than buffering past the cap.
        await reader.cancel();
        throw new TransportError(
          "too_large",
          "That file is larger than the 64 MiB limit.",
        );
      }
      chunks.push(value);
      input.onProgress(loaded, total);
    }
  } catch (error) {
    if (error instanceof TransportError) throw error;
    if (input.signal.aborted) {
      throw new TransportError("cancelled", "Fetch cancelled.");
    }
    throw new TransportError(
      "blocked",
      "The download stopped before it finished.",
    );
  }

  if (loaded === 0) {
    throw new TransportError("empty", "That URL returned an empty file.");
  }

  // The server classifies by magic bytes regardless; the type here only makes
  // the multipart part honest about what the browser received.
  return new File(chunks, filenameFromUrl(finalUrl), {
    type:
      contentType && contentType !== "application/octet-stream"
        ? contentType
        : "",
  });
}
