import assert from "node:assert/strict";
import test from "node:test";

import { safeAuditMetadata } from "./sanitize";

void test("audit metadata drops credential-shaped fields and unsafe values", () => {
  assert.deepEqual(
    safeAuditMetadata({
      authorization: "Bearer secret",
      pollSecret: "secret",
      cookie: "session=secret",
      route: "/api/uploads",
      url: "https://example.test/?X-Amz-Credential=secret&X-Amz-Signature=x",
      count: 3,
    }),
    {
      route: "/api/uploads",
      url: "[redacted]",
      count: 3,
    },
  );
});
