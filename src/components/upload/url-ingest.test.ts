import { afterEach, describe, expect, it, vi } from "vitest";

import { TransportError } from "./transport";
import {
  fetchUrlBytes,
  parseHttpsUrl,
  URL_INGEST_BYTE_CAP,
} from "./url-ingest";

function responseAt(
  url: string,
  body: BodyInit = new Uint8Array([137, 80, 78, 71]),
  headers: HeadersInit = {
    "content-length": "4",
    "content-type": "image/png",
  },
): Response {
  const response = new Response(body, { status: 200, headers });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

function parseError(value: string): unknown {
  try {
    parseHttpsUrl(value);
    return null;
  } catch (error) {
    return error;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browser URL ingestion", () => {
  it("accepts credential-free HTTPS and rejects other initial URLs", () => {
    expect(parseHttpsUrl(" https://files.example/meme.png ").href).toBe(
      "https://files.example/meme.png",
    );
  });

  it.each([
    ["http://files.example/meme.png", "insecure_url"],
    ["file:///tmp/meme.png", "insecure_url"],
    ["https://user:secret@files.example/meme.png", "credentialed_url"],
  ] as const)("rejects unsafe initial URL %s", (value, code) => {
    const error = parseError(value);
    expect(error).toBeInstanceOf(TransportError);
    expect(error).toMatchObject({ code });
  });

  it("fetches without credentials or referrer and returns final HTTPS bytes", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(responseAt("https://cdn.example/final%20meme.png"));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    const progress = vi.fn<(loaded: number, total: number | null) => void>();

    const file = await fetchUrlBytes({
      url: parseHttpsUrl("https://files.example/start.png"),
      signal,
      onProgress: progress,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://files.example/start.png"),
      {
        credentials: "omit",
        referrerPolicy: "no-referrer",
        mode: "cors",
        redirect: "follow",
        cache: "no-store",
        signal,
      },
    );
    expect(file.name).toBe("final meme.png");
    expect(file.type).toBe("image/png");
    expect(file.size).toBe(4);
    expect(progress).toHaveBeenLastCalledWith(4, 4);
  });

  it("revalidates callers and the final observable redirect URL", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(responseAt("http://files.example/downgraded.png"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchUrlBytes({
        url: new URL("http://files.example/start.png"),
        signal: new AbortController().signal,
        onProgress: () => undefined,
      }),
    ).rejects.toMatchObject({ code: "insecure_url" });
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(
      fetchUrlBytes({
        url: new URL("https://files.example/start.png"),
        signal: new AbortController().signal,
        onProgress: () => undefined,
      }),
    ).rejects.toMatchObject({ code: "insecure_redirect" });
  });

  it("rejects declared oversized responses before buffering the body", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      responseAt("https://files.example/large.bin", undefined, {
        "content-length": String(URL_INGEST_BYTE_CAP + 1),
        "content-type": "application/octet-stream",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchUrlBytes({
        url: new URL("https://files.example/large.bin"),
        signal: new AbortController().signal,
        onProgress: () => undefined,
      }),
    ).rejects.toMatchObject({ code: "too_large" });
  });

  it("reports browser-policy/network rejection without claiming one cause", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    await expect(
      fetchUrlBytes({
        url: new URL("https://files.example/meme.png"),
        signal: new AbortController().signal,
        onProgress: () => undefined,
      }),
    ).rejects.toMatchObject({
      code: "blocked",
      message: expect.stringContaining("browser blocked"),
    });
  });
});
