import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertBodylessRequest } from "./gateway";

void describe("S3 bodyless requests", () => {
  void it("accepts Shottr's empty DELETE stream without Content-Length", async () => {
    const init: RequestInit & { duplex: "half" } = {
      body: new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
      duplex: "half",
      method: "DELETE",
    };
    const request = new Request("https://seedyn.example/seedyn/test.txt", init);

    await assert.doesNotReject(assertBodylessRequest(request));
  });

  void it("rejects a DELETE stream that contains bytes", async () => {
    const request = new Request("https://seedyn.example/seedyn/test.txt", {
      body: "not empty",
      method: "DELETE",
    });

    await assert.rejects(assertBodylessRequest(request), {
      code: "InvalidRequest",
    });
  });
});
