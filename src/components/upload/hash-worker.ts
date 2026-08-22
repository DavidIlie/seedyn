/// <reference lib="webworker" />

import { createSHA256 } from "hash-wasm";

const HASH_CHUNK_BYTES = 4 * 1024 * 1024;
const PREFIX_BYTES = 8 * 1024;

type HashRequest = { file: File };

self.onmessage = (event: MessageEvent<HashRequest>) => {
  void (async () => {
    const { file } = event.data;
    const hasher = await createSHA256();
    hasher.init();
    let prefix: Uint8Array | undefined;
    for (let offset = 0; offset < file.size; offset += HASH_CHUNK_BYTES) {
      const bytes = new Uint8Array(
        await file.slice(offset, offset + HASH_CHUNK_BYTES).arrayBuffer(),
      );
      if (!prefix) prefix = bytes.slice(0, PREFIX_BYTES);
      hasher.update(bytes);
    }
    const finalPrefix = prefix ?? new Uint8Array();
    self.postMessage(
      { sha256: hasher.digest("hex"), prefix: finalPrefix },
      { transfer: [finalPrefix.buffer] },
    );
  })().catch((error: unknown) => {
    self.postMessage({
      error: error instanceof Error ? error.message : "File preparation failed",
    });
  });
};

export {};
