import { stat } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { parseMultipartUpload } from "./multipart";

function request(form: FormData): Request {
  return new Request("http://seedyn.local/api/upload", {
    method: "POST",
    body: form,
  });
}

describe("bounded multipart parsing", () => {
  it("spools one file with mode 0600 and exposes a disposable handle", async () => {
    const form = new FormData();
    form.set("kind", "auto");
    form.set("file", new File(["hello"], "hello.txt", { type: "text/plain" }));
    const parsed = await parseMultipartUpload(request(form), {
      permittedFileFields: new Set(["file"]),
      maxFileBytes: 100,
    });
    expect(parsed.byteSize).toBe(5);
    expect(parsed.originalName).toBe("hello.txt");
    expect(parsed.fields).toEqual({ kind: "auto" });
    expect((await stat(parsed.path)).mode & 0o777).toBe(0o600);
    await parsed.dispose();
    await expect(stat(parsed.path)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(parsed.dispose()).resolves.toBeUndefined();
  });

  it("enforces actual file bytes", async () => {
    const form = new FormData();
    form.set("file", new File(["123456"], "oversize.bin"));
    await expect(
      parseMultipartUpload(request(form), {
        permittedFileFields: new Set(["file"]),
        maxFileBytes: 5,
      }),
    ).rejects.toMatchObject({ code: "payload_too_large" });
  });

  it("cancels an unfinished request as soon as the file limit is reached", async () => {
    const boundary = "seedyn-oversize";
    const bytes = new TextEncoder().encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="oversize.bin"\r\nContent-Type: application/octet-stream\r\n\r\n123456`,
    );
    let cancelReason: unknown;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        // Deliberately leave the request open. Waiting for completion would
        // make this test time out instead of returning payload_too_large.
      },
      cancel(reason) {
        cancelReason = reason;
      },
    });
    const init: RequestInit & { duplex: "half" } = {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
      duplex: "half",
    };
    const unfinished = new Request("http://seedyn.local/api/upload", init);

    await expect(
      parseMultipartUpload(unfinished, {
        permittedFileFields: new Set(["file"]),
        maxFileBytes: 5,
        timeoutMs: 1_000,
      }),
    ).rejects.toMatchObject({ code: "payload_too_large" });
    await vi.waitFor(() => {
      expect(cancelReason).toMatchObject({ code: "payload_too_large" });
    });
  });

  it("accepts a file exactly at the configured cap", async () => {
    const form = new FormData();
    form.set("file", new File(["12345"], "at-cap.bin"));
    const parsed = await parseMultipartUpload(request(form), {
      permittedFileFields: new Set(["file"]),
      maxFileBytes: 5,
    });
    expect(parsed.byteSize).toBe(5);
    await parsed.dispose();
  });

  it("rejects a second file", async () => {
    const form = new FormData();
    form.append("file", new File(["one"], "one.bin"));
    form.append("file", new File(["two"], "two.bin"));
    await expect(
      parseMultipartUpload(request(form), {
        permittedFileFields: new Set(["file"]),
        maxFileBytes: 100,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("rejects unknown scalar fields", async () => {
    const form = new FormData();
    form.set("admin", "true");
    form.set("file", new File(["one"], "one.bin"));
    await expect(
      parseMultipartUpload(request(form), {
        permittedFileFields: new Set(["file"]),
        maxFileBytes: 100,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("rejects malformed or truncated multipart bodies", async () => {
    const malformed = new Request("http://seedyn.local/api/upload", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=unfinished" },
      body: '--unfinished\r\nContent-Disposition: form-data; name="file"; filename="x"\r\n\r\npartial',
    });
    await expect(
      parseMultipartUpload(malformed, {
        permittedFileFields: new Set(["file"]),
        maxFileBytes: 100,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("rejects an already-aborted request before consuming it", async () => {
    const controller = new AbortController();
    controller.abort();
    const form = new FormData();
    form.set("file", new File(["one"], "one.bin"));
    const aborted = new Request("http://seedyn.local/api/upload", {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    await expect(
      parseMultipartUpload(aborted, {
        permittedFileFields: new Set(["file"]),
        maxFileBytes: 100,
      }),
    ).rejects.toMatchObject({ code: "request_aborted" });
  });
});
