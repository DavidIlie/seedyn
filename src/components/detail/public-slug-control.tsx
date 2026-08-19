"use client";

import { Link2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { SlugAvailabilityField } from "~/components/slug/slug-availability-field";
import {
  customPublicSlugError,
  normalizeCustomPublicSlug,
} from "~/lib/public-slug";

import { changePublicSlugAction, type ChangeSlugState } from "./slug-actions";

const INITIAL_STATE: ChangeSlugState = { status: "idle" };

export function PublicSlugControl({
  uploadId,
  currentSlug,
  extension,
}: {
  uploadId: string;
  currentSlug: string;
  extension: string;
}) {
  const currentIsCustom =
    currentSlug === normalizeCustomPublicSlug(currentSlug) &&
    customPublicSlugError(currentSlug) === null;
  const [value, setValue] = useState(currentIsCustom ? currentSlug : "");
  const [state, action] = useActionState(changePublicSlugAction, INITIAL_STATE);

  useEffect(() => {
    if (state.status === "saved") setValue(state.slug);
  }, [state]);

  return (
    <section
      aria-labelledby="public-url-heading"
      className="border-border bg-panel rounded-xl border p-4"
    >
      <div className="flex items-start gap-3">
        <span className="bg-sunken text-accent grid size-9 shrink-0 place-items-center rounded-lg">
          <Link2 aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 id="public-url-heading" className="text-sm font-semibold">
            Public URL
          </h2>
          <p className="text-muted-foreground mt-0.5 text-xs break-all">
            Current slug: <code className="font-mono">{currentSlug}</code>
          </p>
        </div>
      </div>

      <form action={action} className="mt-4 space-y-3">
        <input type="hidden" name="uploadId" value={uploadId} />
        <SlugAvailabilityField
          value={value}
          onChange={setValue}
          excludeUploadId={uploadId}
          required
        />
        <p className="text-muted-foreground -mt-2 text-xs">
          Final path:{" "}
          <code className="font-mono">
            /{value || "slug"}.{extension}
          </code>
        </p>
        <div className="flex items-center justify-between gap-3">
          <p
            aria-live="polite"
            className={
              "text-xs " +
              (state.status === "error"
                ? "text-danger"
                : state.status === "saved"
                  ? "text-[var(--success)]"
                  : "text-muted-foreground")
            }
          >
            {state.status === "idle"
              ? "Changing this rotates the direct link."
              : state.message}
          </p>
          <SaveSlugButton disabled={!value || value === currentSlug} />
        </div>
      </form>
    </section>
  );
}

function SaveSlugButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="bg-brand text-brand-foreground hover:bg-accent h-11 shrink-0 rounded-lg px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45"
    >
      {pending ? "Saving…" : "Change URL"}
    </button>
  );
}
