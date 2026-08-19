"use client";

import { useActionState } from "react";

import { HydratedSubmitButton } from "~/components/ui/hydrated-submit-button";
import { buttonCompact, inputBase, labelBase } from "~/components/ui/styles";
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
      <label htmlFor={`key-domain-${apiKeyId}`} className={labelBase}>
        Link domain
      </label>
      <div className="flex gap-2">
        <select
          id={`key-domain-${apiKeyId}`}
          name="mediaDomain"
          defaultValue={mediaDomain ?? ""}
          className={inputBase}
        >
          <option value="">Account default</option>
          {mediaDomains.map((domain) => (
            <option key={domain.id} value={domain.id}>
              {domain.host}
            </option>
          ))}
        </select>
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
