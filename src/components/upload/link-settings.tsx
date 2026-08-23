"use client";

import { ChevronDown } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import { changePublicSlugAction } from "~/components/detail/slug-actions";
import {
  ACCOUNT_DEFAULT_MEDIA_DOMAIN,
  MediaDomainSelect,
} from "~/components/media/media-domain-select";
import { SlugAvailabilityField } from "~/components/slug/slug-availability-field";
import { Button } from "~/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { Label } from "~/components/ui/label";
import type { MediaDomainChoice } from "~/server/media/origin-preferences";

import { changeUploadMediaDomainAction } from "./media-domain-actions";

/**
 * Everything about the link that nobody should have to decide in advance.
 *
 * The upload already has a permanent URL on the account's default domain by the
 * time this renders, so the whole panel is collapsed and optional. Opening it
 * changes an object that exists; ignoring it costs nothing.
 */

export function LinkSettings({
  uploadId,
  currentSlug,
  extension,
  mediaDomains,
  currentMediaOrigin,
  onUrlChange,
}: {
  uploadId: string;
  currentSlug: string;
  extension: string;
  mediaDomains: MediaDomainChoice[];
  currentMediaOrigin: string | null;
  onUrlChange: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-between px-0 hover:bg-transparent"
        >
          Customise link
          <ChevronDown
            aria-hidden="true"
            className={`size-4 transition-transform duration-150 ease-out motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-border mt-2 space-y-4 rounded-lg border p-3">
        <SlugForm
          uploadId={uploadId}
          currentSlug={currentSlug}
          extension={extension}
          onUrlChange={onUrlChange}
        />
        {mediaDomains.length > 1 ? (
          <MediaDomainField
            uploadId={uploadId}
            mediaDomains={mediaDomains}
            currentMediaOrigin={currentMediaOrigin}
            onUrlChange={onUrlChange}
          />
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

function SlugForm({
  uploadId,
  currentSlug,
  extension,
  onUrlChange,
}: {
  uploadId: string;
  currentSlug: string;
  extension: string;
  onUrlChange: (url: string) => void;
}) {
  const [value, setValue] = useState("");
  const [state, action] = useActionState(changePublicSlugAction, {
    status: "idle",
  } as const);

  useEffect(() => {
    if (state.status === "saved") {
      setValue(state.slug);
      onUrlChange(state.url);
    }
  }, [onUrlChange, state]);

  const saved = state.status === "saved" ? state.slug : null;

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="uploadId" value={uploadId} />
      <SlugAvailabilityField
        value={value}
        onChange={setValue}
        excludeUploadId={uploadId}
      />
      <div className="flex items-center justify-between gap-3">
        <p
          aria-live="polite"
          className={
            "min-w-0 text-xs " +
            (state.status === "error"
              ? "text-danger"
              : state.status === "saved"
                ? "text-[var(--success)]"
                : "text-muted-foreground")
          }
        >
          {state.status === "idle"
            ? `Now at /${saved ?? currentSlug}.${extension}`
            : state.message}
        </p>
        <SaveSlugButton disabled={!value || value === (saved ?? currentSlug)} />
      </div>
    </form>
  );
}

function SaveSlugButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={disabled || pending}>
      {pending ? "Saving…" : "Use this slug"}
    </Button>
  );
}

function MediaDomainField({
  uploadId,
  mediaDomains,
  currentMediaOrigin,
  onUrlChange,
}: {
  uploadId: string;
  mediaDomains: MediaDomainChoice[];
  currentMediaOrigin: string | null;
  onUrlChange: (url: string) => void;
}) {
  const matching = mediaDomains.find(
    (domain) => domain.origin === currentMediaOrigin,
  );
  const [value, setValue] = useState(
    matching ? matching.id : ACCOUNT_DEFAULT_MEDIA_DOMAIN,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fieldId = `${uploadId}-media-domain`;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={fieldId}>Media domain</Label>
      <MediaDomainSelect
        id={fieldId}
        // Nothing is submitted: this panel changes an upload that already
        // exists, one selection at a time.
        name={null}
        mediaDomains={mediaDomains}
        value={value}
        disabled={pending}
        aria-describedby={`${fieldId}-hint`}
        onValueChange={(next) => {
          const previous = value;
          setValue(next);
          setMessage(null);
          startTransition(async () => {
            const result = await changeUploadMediaDomainAction({
              uploadId,
              mediaDomainId: next,
            });
            if (result.status === "saved") {
              onUrlChange(result.url);
              return;
            }
            // The link did not move, so neither does the control.
            setValue(previous);
            if (result.status === "error") setMessage(result.message);
          });
        }}
      />
      <p
        id={`${fieldId}-hint`}
        aria-live="polite"
        className={`text-xs ${message ? "text-danger" : "text-muted-foreground"}`}
      >
        {message ??
          "Only the link changes. The same object stays available on every media host."}
      </p>
    </div>
  );
}
