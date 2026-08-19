import { randomBytes } from "node:crypto";

import type { S3ProtocolError } from "./errors";

const XML_NAME = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/u;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function createS3RequestId(): string {
  return randomBytes(16).toString("hex").toUpperCase();
}

export function s3ResponseHeaders(requestId: string): Headers {
  return new Headers({
    "Cache-Control": "no-store",
    "X-Amz-Request-Id": requestId,
    "X-Content-Type-Options": "nosniff",
  });
}

export function s3ErrorResponse(input: {
  error: S3ProtocolError;
  head?: boolean;
  requestId: string;
  resource: string;
}): Response {
  const details = input.error.details
    .filter((detail) => XML_NAME.test(detail.name))
    .map(
      (detail) => `<${detail.name}>${escapeXml(detail.value)}</${detail.name}>`,
    )
    .join("");
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<Error>" +
    `<Code>${escapeXml(input.error.code)}</Code>` +
    `<Message>${escapeXml(input.error.message)}</Message>` +
    `<Resource>${escapeXml(input.resource)}</Resource>` +
    `<RequestId>${escapeXml(input.requestId)}</RequestId>` +
    details +
    "</Error>";
  const headers = s3ResponseHeaders(input.requestId);
  headers.set("Content-Type", "application/xml; charset=utf-8");
  if (!input.head) {
    headers.set("Content-Length", String(Buffer.byteLength(body, "utf8")));
  }
  return new Response(input.head ? null : body, {
    status: input.error.status,
    headers,
  });
}
