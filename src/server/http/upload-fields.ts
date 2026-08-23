import "server-only";

import type {
  ForcedUploadKind,
  HtmlRenderingRequest,
} from "~/server/uploads/classification";

/**
 * The two multipart scalar fields every upload entry point parses.
 *
 * Both the browser route and the machine routes accept them, and they used to
 * be copied into each file. One definition keeps the browser and the HTTP/ShareX
 * contract from drifting apart.
 */

export function requestedKind(
  value: string | undefined,
): ForcedUploadKind | null {
  if (value === undefined || value === "auto") return "auto";
  if (value === "image" || value === "file" || value === "text") return value;
  return null;
}

/**
 * `auto` is the browser's request: render the file as a page when it really is
 * an HTML document, and fall back to a plain download otherwise. Machine
 * clients keep the explicit boolean, so the ShareX/HTTP contract is unchanged
 * and an omitted field still means "do not render".
 */
export function requestedHtmlRendering(
  value: string | undefined,
): HtmlRenderingRequest | null {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  if (value === "auto") return "auto";
  return null;
}
