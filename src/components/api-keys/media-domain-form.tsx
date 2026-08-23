"use client";

import { useActionState } from "react";

import { MediaDomainSelect } from "~/components/media/media-domain-select";
import { Label } from "~/components/ui/label";
import { HydratedSubmitButton } from "~/components/ui/hydrated-submit-button";
import { buttonCompact } from "~/components/ui/styles";
import type { MediaDomainChoice } from "~/server/media/origin-preferences";

import {
  updateApiKeyMediaDomainAction,
  type UpdateKeyDomainState,
} from "./actions";

export function KeyMediaDomainForm({
  apiKeyId,
  mediaDomain,
  mediaDomains,
}: {
  apiKeyId: string;
  mediaDomain: string | null;
  mediaDomains: MediaDomainChoice[];
}) {
  const [state, action] = useActionState<UpdateKeyDomainState, FormData>(
    updateApiKeyMediaDomainAction,
    { status: "idle" },
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="apiKeyId" value={apiKeyId} />
      <Label htmlFor={`key-domain-${apiKeyId}`}>Link domain</Label>
      <div className="flex gap-2">
        <MediaDomainSelect
          id={`key-domain-${apiKeyId}`}
          mediaDomains={mediaDomains}
          defaultValue={mediaDomain ?? ""}
          className="min-w-0 flex-1"
        />
        <HydratedSubmitButton
          label="Save"
          pendingLabel="Saving…"
          className={buttonCompact}
        />
      </div>
      {state.status !== "idle" ? (
        <span
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "error"
              ? "text-danger text-xs"
              : "text-muted-foreground text-xs"
          }
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
