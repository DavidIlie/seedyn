import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { requireSessionUser } from "~/components/data/session";
import {
  publicUrl,
  readyGifVariant,
  uploadUrl,
} from "~/components/data/uploads";
import { DeleteUpload } from "~/components/detail/delete-upload";
import {
  MetadataList,
  MetadataListSkeleton,
} from "~/components/detail/metadata-list";
import {
  UploadPreview,
  UploadPreviewSkeleton,
} from "~/components/detail/upload-preview";
import {
  UrlHeading,
  UrlHeadingSkeleton,
} from "~/components/detail/url-heading";
import { GifPanel } from "~/components/gif/gif-panel";
import { buttonQuiet } from "~/components/ui/styles";
import { DomainError } from "~/server/uploads/errors";
import { getOwnedUpload } from "~/server/uploads/service";

export const metadata: Metadata = { title: "Upload" };

/**
 * The record is entirely request-time and ownership-scoped, so all of it
 * streams. What commits immediately is the frame: back target, heading row,
 * preview box, metadata rows, and the GIF panel — at the sizes the real content
 * will occupy.
 */
export const instant = true;

export default function UploadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <>
      <div className="pt-8 pb-4">
        <Link
          href="/dashboard"
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          ← Dashboard
        </Link>
      </div>

      <Suspense fallback={<DetailSkeleton />}>
        <Detail params={params} />
      </Suspense>
    </>
  );
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSessionUser();

  const upload = await getOwnedUpload(user.id, id).catch((error: unknown) => {
    // Another user's upload and a nonexistent one are the same answer; the
    // service already refuses to distinguish them.
    if (error instanceof DomainError && error.code === "not_found") notFound();
    throw error;
  });

  const url = uploadUrl(upload);
  const gif = readyGifVariant(upload);

  return (
    <>
      <UrlHeading url={url} />

      <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <UploadPreview upload={upload} url={url} />
          <div>
            <h2 className="pb-3 text-sm font-medium">Details</h2>
            <MetadataList upload={upload} />
          </div>
        </div>

        <div className="space-y-6">
          <GifPanel
            uploadId={upload.id}
            uploadKind={upload.kind}
            contentType={upload.contentType}
            extension={upload.extension}
            sourceUrl={url}
            storedGifUrl={gif ? publicUrl(gif.publicSlug, gif.extension) : null}
            storedGifBytes={gif?.byteSize ?? null}
          />

          <a
            href={url}
            rel="noreferrer"
            className={`${buttonQuiet} w-full`}
            target="_blank"
          >
            Open original
          </a>
        </div>
      </div>

      <div className="mt-10">
        <DeleteUpload uploadId={upload.id} filename={upload.originalName} />
      </div>
    </>
  );
}

function DetailSkeleton() {
  return (
    <>
      <UrlHeadingSkeleton />
      <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <UploadPreviewSkeleton />
          <div>
            <h2 className="pb-3 text-sm font-medium">Details</h2>
            <MetadataListSkeleton />
          </div>
        </div>
        <div
          aria-hidden="true"
          className="border-border h-44 rounded-md border"
        />
      </div>
    </>
  );
}
