/**
 * The two browser-session Route Handlers this UI talks to.
 *
 * They live here, in one place, because they are the seam between the interface
 * and the canonical handlers at `src/app/api/uploads/route.ts` and
 * `src/app/api/uploads/[id]/gif/route.ts`.
 *
 * Both routes require an exact same-origin `Origin` header and a session
 * cookie, and both answer with the `{ id, url }` shape on success and the
 * `{ error: { code, message, requestId } }` envelope on failure.
 *
 * A Server Action cannot back either call: neither exposes upload-progress
 * events, and both need a real abort.
 */

export const BROWSER_UPLOAD_ENDPOINT = "/api/uploads";

export function browserGifEndpoint(uploadId: string): string {
  return `/api/uploads/${encodeURIComponent(uploadId)}/gif`;
}

/** Multipart field name shared with the ShareX-compatible endpoints. */
export const UPLOAD_FILE_FIELD = "file";
