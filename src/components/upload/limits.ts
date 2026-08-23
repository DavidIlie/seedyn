/**
 * Client-side mirrors of `UPLOAD_LIMITS` in `~/server/uploads/multipart`.
 *
 * The server remains the authority; these exist so the browser can refuse a
 * file it already knows will be rejected instead of spending a minute
 * uploading 64 MiB for a 413.
 */

const MEBIBYTE = 1024 * 1024;

/** Anything larger is refused by the multipart parser. */
export const UPLOAD_BYTE_CAP = 64 * MEBIBYTE;

/** Images and text carry a lower ceiling than generic files. */
export const IMAGE_OR_TEXT_BYTE_CAP = 16 * MEBIBYTE;

/**
 * The ceiling that will apply to this file, judged from the browser's own MIME
 * guess. A wrong guess only costs a late server-side rejection, never an
 * accepted upload that should have been refused.
 */
export function likelyByteCap(file: File): number {
  const type = file.type.toLowerCase();
  return type.startsWith("image/") || type.startsWith("text/")
    ? IMAGE_OR_TEXT_BYTE_CAP
    : UPLOAD_BYTE_CAP;
}
