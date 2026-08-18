import { describe, expect, it, vi } from "vitest";
import {
  getRewrittenUrl,
  isRewrite,
  unstable_doesMiddlewareMatch,
} from "next/experimental/testing/server";
import { NextRequest } from "next/server";

import { VERIFIED_MEDIA_REWRITE_HEADER } from "~/lib/origin";

import { config, proxy } from "./proxy";

describe("proxy origin boundary", () => {
  it("serves app routes only on the app origin", () => {
    const response = proxy(
      new NextRequest("http://seedyn.localhost:3000/dashboard"),
    );
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("rewrites an exact media URL to the private handler", () => {
    const response = proxy(
      new NextRequest("http://i.localhost:3000/AbCdEfGhIjKlMnOpQrStUv.png"),
    );
    expect(isRewrite(response)).toBe(true);
    expect(getRewrittenUrl(response)).toContain(
      "/internal/media/AbCdEfGhIjKlMnOpQrStUv.png",
    );
  });

  it("keeps the internal listen authority when the public Host differs", () => {
    const response = proxy(
      new NextRequest("http://localhost:3000/AbCdEfGhIjKlMnOpQrStUv.png", {
        headers: {
          host: "i.localhost:3000",
          [VERIFIED_MEDIA_REWRITE_HEADER]: "1",
        },
      }),
    );
    expect(getRewrittenUrl(response)).toBe(
      "http://localhost:3000/internal/media/AbCdEfGhIjKlMnOpQrStUv.png",
    );
  });

  it("allows only its own media rewrite through the private handler path", () => {
    const initial = proxy(
      new NextRequest("http://localhost:3000/AbCdEfGhIjKlMnOpQrStUv.png", {
        headers: { host: "i.localhost:3000" },
      }),
    );
    const token = initial.headers.get(
      "x-middleware-request-x-seedyn-internal-media-rewrite",
    );
    expect(token).toBeTruthy();
    expect(
      initial.headers.get(
        `x-middleware-request-${VERIFIED_MEDIA_REWRITE_HEADER}`,
      ),
    ).toBeNull();

    const internal = proxy(
      new NextRequest(
        "http://localhost:3000/internal/media/AbCdEfGhIjKlMnOpQrStUv.png",
        {
          headers: {
            host: "localhost:3000",
            "x-seedyn-internal-media-rewrite": token!,
          },
        },
      ),
    );
    expect(internal.headers.get("x-middleware-next")).toBe("1");
    expect(
      internal.headers.get(
        "x-middleware-request-x-seedyn-internal-media-rewrite",
      ),
    ).toBeNull();
    expect(
      internal.headers.get(
        `x-middleware-request-${VERIFIED_MEDIA_REWRITE_HEADER}`,
      ),
    ).toBe("1");

    expect(
      proxy(
        new NextRequest(
          "http://i.localhost:3000/internal/media/AbCdEfGhIjKlMnOpQrStUv.png",
        ),
      ).status,
    ).toBe(404);
  });

  it("does not expose app routes or mutation methods on the media origin", () => {
    expect(
      proxy(new NextRequest("http://i.localhost:3000/dashboard")).status,
    ).toBe(404);
    expect(
      proxy(
        new NextRequest("http://i.localhost:3000/AbCdEfGhIjKlMnOpQrStUv.png", {
          method: "POST",
        }),
      ).status,
    ).toBe(404);
    expect(
      proxy(new NextRequest("http://i.localhost:3000/api/healthz")).status,
    ).toBe(404);
  });

  it("does not expose the internal media handler on the app origin", () => {
    expect(
      proxy(
        new NextRequest(
          "http://seedyn.localhost:3000/internal/media/AbCdEfGhIjKlMnOpQrStUv.png",
        ),
      ).status,
    ).toBe(404);
  });

  it("rejects encoded docs segments before production route matching", () => {
    for (const pathname of ["/docs/%25", "/llms.mdx/docs/%25"]) {
      expect(
        proxy(new NextRequest(`http://seedyn.localhost:3000${pathname}`))
          .status,
      ).toBe(404);
    }
    expect(
      proxy(
        new NextRequest("http://seedyn.localhost:3000/docs/api-keys"),
      ).headers.get("x-middleware-next"),
    ).toBe("1");
  });

  it("fails closed for unknown and malformed authorities", () => {
    expect(
      proxy(new NextRequest("http://attacker.test/dashboard")).status,
    ).toBe(421);
    expect(
      proxy(
        new NextRequest("http://seedyn.localhost:3000/dashboard", {
          headers: { host: "seedyn.localhost,attacker.test" },
        }),
      ).status,
    ).toBe(421);
  });

  it("ignores forwarded host poisoning", () => {
    const response = proxy(
      new NextRequest("http://seedyn.localhost:3000/dashboard", {
        headers: { "x-forwarded-host": "attacker.test" },
      }),
    );
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("keeps process liveness available to direct probe authorities", () => {
    for (const authority of ["10.0.0.3", "127.0.0.1", "localhost"]) {
      const response = proxy(
        new NextRequest(`http://${authority}/api/healthz`),
      );
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("allows readiness only on loopback or the configured pod IP", () => {
    expect(
      proxy(
        new NextRequest("http://127.0.0.1/api/readyz", {
          headers: { host: "127.0.0.1" },
        }),
      ).headers.get("x-middleware-next"),
    ).toBe("1");
    expect(proxy(new NextRequest("http://10.0.0.3/api/readyz")).status).toBe(
      421,
    );
    expect(proxy(new NextRequest("http://1.2.3.4/api/readyz")).status).toBe(
      421,
    );

    vi.stubEnv("POD_IP", "10.0.0.3");
    try {
      expect(
        proxy(new NextRequest("http://10.0.0.3/api/readyz")).headers.get(
          "x-middleware-next",
        ),
      ).toBe("1");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("keeps dependency readiness off public and arbitrary authorities", () => {
    expect(
      proxy(new NextRequest("http://seedyn.localhost:3000/api/readyz")).status,
    ).toBe(404);
    expect(
      proxy(
        new NextRequest("http://attacker.test/api/readyz", {
          headers: { host: "attacker.test" },
        }),
      ).status,
    ).toBe(421);
  });
});

describe("proxy matcher", () => {
  it.each([
    "/api/upload",
    "/api/files",
    "/api/images",
    "/api/texts",
    "/api/uploads",
    "/api/uploads/123e4567-e89b-42d3-a456-426614174000/gif",
  ])("does not clone an upload request body at %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(
      false,
    );
  });

  it.each([
    "/dashboard",
    "/api/auth/session",
    "/api/healthz",
    "/api/readyz",
    "/api/uploaded",
    "/api/filesystem",
    "/api/uploads/123e4567-e89b-42d3-a456-426614174000",
    "/api/uploads/123e4567-e89b-42d3-a456-426614174000/other",
    "/api/upload/other",
  ])("continues to enforce the origin boundary at %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(
      true,
    );
  });
});
