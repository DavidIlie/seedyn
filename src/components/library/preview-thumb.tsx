import type { SerializedUpload } from "~/server/uploads/serialization";

import { uploadKindGlyph } from "~/components/lib/format";
import { uploadUrl } from "~/components/data/uploads";

/**
 * A fixed 40×40 bordered preview slot.
 *
 * The type glyph is always painted; an image preview is layered on top of it.
 * That ordering is what keeps a row's geometry stable: an image that 404s,
 * times out, or is still in flight leaves a transparent element over the glyph,
 * so the slot reads as its type instead of collapsing. No JavaScript, no
 * `onError` handler, and therefore no client boundary.
 */
export function PreviewThumb({
  upload,
  className = "",
}: {
  upload: SerializedUpload;
  className?: string;
}) {
  const showImage = upload.kind === "IMAGE" && upload.state === "READY";

  return (
    <span
      aria-hidden="true"
      className={
        "border-border bg-sunken relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border " +
        className
      }
    >
      <span className="text-muted-foreground font-mono text-[10px] tracking-wider">
        {uploadKindGlyph(upload.kind)}
      </span>
      {showImage ? (
        /* oxlint-disable-next-line next/no-img-element -- immutable user media deliberately bypasses the optimizer */
        <img
          src={uploadUrl(upload)}
          alt=""
          loading="lazy"
          decoding="async"
          width={40}
          height={40}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
    </span>
  );
}
