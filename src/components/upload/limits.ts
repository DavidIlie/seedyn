/**
 * Client-side mirrors of `UPLOAD_LIMITS` in `~/server/uploads/multipart`.
 *
 * The server remains the authority; these exist so the browser can refuse a
 * file it already knows will be rejected instead of spending a minute
 * uploading 64 MiB for a 413.
 */

const MEBIBYTE = 1024 * 1024;

/** Anything larger cannot go through the single-request multipart parser. */
export const UPLOAD_BYTE_CAP = 64 * MEBIBYTE;

/** Images and text carry a lower ceiling than generic files. */
export const IMAGE_OR_TEXT_BYTE_CAP = 16 * MEBIBYTE;

function isImageOrText(file: File): boolean {
  const type = file.type.toLowerCase();
  return type.startsWith("image/") || type.startsWith("text/");
}

/**
 * Whether this file has to travel as a resumable multipart session.
 *
 * Only files above the single-request ceiling do, and only kinds the server
 * will accept at that size: an image or a text file over 16 MiB is refused
 * either way, so sending it part by part would just be a slower rejection.
 */
export function usesDirectUpload(file: File): boolean {
  return file.size > UPLOAD_BYTE_CAP && !isImageOrText(file);
}

/**
 * The ceiling that will apply to this file, judged from the browser's own MIME
 * guess. A wrong guess only costs a late server-side rejection, never an
 * accepted upload that should have been refused.
 */
export function likelyByteCap(
  file: File,
  directUploadMaxBytes: number,
): number {
  if (isImageOrText(file)) return IMAGE_OR_TEXT_BYTE_CAP;
  return Math.max(UPLOAD_BYTE_CAP, directUploadMaxBytes);
}
