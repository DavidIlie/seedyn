import { spawn } from "node:child_process";
import { connect, createServer } from "node:net";
import { fileURLToPath } from "node:url";

const nextBin = fileURLToPath(
  new URL("../node_modules/next/dist/bin/next", import.meta.url),
);
const portValue = process.env.PORT ?? "3000";
if (!/^\d{1,5}$/u.test(portValue) || Number(portValue) > 65_535) {
  throw new Error("PORT must be an integer from 1 through 65535");
}
const port = Number(portValue);

// Browsers may resolve *.localhost to either loopback family. Next accepts one
// listen address, so keep it on IPv4 and bridge IPv6 loopback at the TCP layer.
// Both sockets remain physically unreachable from LAN peers.
/** @type {Set<import("node:net").Socket>} */
const sockets = new Set();
let proxyClosed = false;
const ipv6Proxy = createServer((downstream) => {
  const upstream = connect({ host: "127.0.0.1", port });
  sockets.add(downstream);
  sockets.add(upstream);
  downstream.pipe(upstream);
  upstream.pipe(downstream);
  const close = () => {
    sockets.delete(downstream);
    sockets.delete(upstream);
    downstream.destroy();
    upstream.destroy();
  };
  downstream.once("error", close);
  upstream.once("error", close);
  downstream.once("close", close);
  upstream.once("close", close);
});

function closeIpv6Proxy() {
  if (proxyClosed) return;
  proxyClosed = true;
  if (ipv6Proxy.listening) ipv6Proxy.close();
  for (const socket of sockets) socket.destroy();
  sockets.clear();
}

ipv6Proxy.once("error", (error) => {
  console.error(
    error instanceof Error ? error.message : "Unable to bind IPv6 loopback",
  );
  process.exitCode = 1;
  closeIpv6Proxy();
  child.kill("SIGTERM");
});
ipv6Proxy.listen(port, "::1");

// The local credentials provider has no password by design. Keep the supported
// development server physically unreachable from LAN peers, and mark the child
// so the provider refuses to initialize under a manually exposed `next dev`.
const child = spawn(
  process.execPath,
  [
    nextBin,
    "dev",
    "--turbopack",
    "--hostname",
    "127.0.0.1",
    "--port",
    portValue,
  ],
  {
    stdio: "inherit",
    env: { ...process.env, SEEDYN_DEV_LOOPBACK_BOUND: "1" },
  },
);

const forwardedSignals = new Map();
for (const signal of ["SIGINT", "SIGTERM"]) {
  const forward = () => {
    closeIpv6Proxy();
    child.kill(signal);
  };
  forwardedSignals.set(signal, forward);
  process.on(signal, forward);
}

child.once("error", (error) => {
  closeIpv6Proxy();
  console.error(
    error instanceof Error ? error.message : "Unable to start Next.js",
  );
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  closeIpv6Proxy();
  if (signal) {
    process.exitCode = 1;
    for (const [forwardedSignal, forward] of forwardedSignals) {
      process.removeListener(forwardedSignal, forward);
    }
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
