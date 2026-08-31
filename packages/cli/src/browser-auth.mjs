import { generateKeyPairSync, privateDecrypt } from "node:crypto";

import { CliError } from "./errors.mjs";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function json(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function responseError(response, body) {
  const message = body?.error?.message;
  return new CliError(
    typeof message === "string"
      ? message
      : `Seedyn authentication failed with HTTP ${response.status}.`,
  );
}

export async function browserLogin({ apiUrl, version, openBrowser }) {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2_048,
  });
  const publicKeyPem = publicKey
    .export({ type: "spki", format: "pem" })
    .toString();

  let startResponse;
  try {
    startResponse = await fetch(`${apiUrl}/api/cli-auth/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": `seedyn/${version}`,
      },
      body: JSON.stringify({ publicKey: publicKeyPem }),
    });
  } catch (error) {
    throw new CliError(`Could not reach ${apiUrl}.`, { cause: error });
  }
  const started = await json(startResponse);
  if (!startResponse.ok) throw responseError(startResponse, started);
  if (
    typeof started?.requestId !== "string" ||
    typeof started?.pollSecret !== "string" ||
    typeof started?.verificationUrl !== "string" ||
    typeof started?.expiresAt !== "string"
  ) {
    throw new CliError("Seedyn returned an invalid authentication response.");
  }

  console.log(`Open this page to connect the CLI:\n${started.verificationUrl}`);
  if (openBrowser(started.verificationUrl)) {
    console.log("Opened the page in your browser.");
  }
  console.log("Waiting for approval...");

  const expiresAt = Date.parse(started.expiresAt);
  const intervalMs = Math.max(
    1_000,
    Math.min(10_000, Number(started.intervalSeconds || 2) * 1_000),
  );
  while (Date.now() < expiresAt) {
    await delay(intervalMs);
    let response;
    try {
      response = await fetch(
        `${apiUrl}/api/cli-auth/poll/${encodeURIComponent(started.requestId)}`,
        {
          headers: {
            Authorization: `Bearer ${started.pollSecret}`,
            "User-Agent": `seedyn/${version}`,
          },
        },
      );
    } catch {
      continue;
    }
    const body = await json(response);
    if (response.status === 202) continue;
    if (!response.ok) throw responseError(response, body);
    if (typeof body?.encryptedApiKey !== "string") {
      throw new CliError("Seedyn returned an invalid encrypted credential.");
    }
    try {
      return privateDecrypt(
        { key: privateKey, oaepHash: "sha256" },
        Buffer.from(body.encryptedApiKey, "base64"),
      ).toString("utf8");
    } catch (error) {
      throw new CliError("The CLI could not decrypt the new credential.", {
        cause: error,
      });
    }
  }
  throw new CliError(
    "The login request expired. Run `seedyn auth login` again.",
  );
}
