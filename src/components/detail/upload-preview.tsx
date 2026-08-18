import { uploadKindGlyph } from "~/components/lib/format";
import type { SerializedUpload } from "~/server/uploads/serialization";

/**
 * The preview is contained, never cropped.
 *
 * A detail page exists to show what was actually uploaded, so a wide screenshot
 * is letterboxed rather than filled to a pleasing rectangle. Uploaded text is
 * deliberately not rendered inline: it is served from a separate origin with a
 * restrictive policy, and re-hosting it inside the authenticated document would
 * undo that.
 */
export function UploadPreview({
  upload,
  url,
}: {
  upload: SerializedUpload;
  url: string;
}) {
  if (upload.state !== "READY") {
    return (
      <Frame>
        <p className="text-muted-foreground text-sm">
          No preview while this upload is being removed.
        </p>
      </Frame>
    );
  }

  if (upload.kind === "IMAGE") {
    return (
      <Frame>
        {/* oxlint-disable-next-line next/no-img-element -- immutable user media deliberately bypasses the optimizer */}
        <img
          src={url}
          alt={upload.originalName}
          className="max-h-[26rem] w-auto max-w-full object-contain"
        />
      </Frame>
    );
  }

  if (upload.kind === "VIDEO") {
    return (
      <Frame>
        {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- Seedyn cannot synthesize captions for arbitrary user uploads */}
        <video
          src={url}
          controls
          preload="metadata"
          playsInline
          className="max-h-[26rem] w-full"
        >
          Your browser cannot play this video inline. Open the original instead.
        </video>
      </Frame>
    );
  }

  return (
    <Frame>
      <p className="text-muted-foreground flex items-center gap-3 text-sm">
        <span
          aria-hidden="true"
          className="border-border bg-sunken grid h-10 w-10 place-items-center rounded-lg border font-mono text-[10px] tracking-wider"
        >
          {uploadKindGlyph(upload.kind)}
        </span>
        {upload.kind === "TEXT"
          ? "Text uploads are served from the public origin, not rendered here."
          : "No inline preview for this file type."}
      </p>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border bg-sunken flex min-h-[12rem] items-center justify-center rounded-xl border p-3">
      {children}
    </div>
  );
}

export function UploadPreviewSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="border-border bg-sunken min-h-[12rem] rounded-xl border"
    />
  );
}
