"use client";

import { useActionState } from "react";

import { HydratedSubmitButton } from "~/components/ui/hydrated-submit-button";
import { buttonCompact, inputBase, labelBase } from "~/components/ui/styles";

import { updateApiKeyNameAction, type UpdateKeyNameState } from "./actions";

export function KeyNameForm({
  apiKeyId,
  name,
}: {
  apiKeyId: string;
  name: string;
}) {
  const [state, action] = useActionState<UpdateKeyNameState, FormData>(
    updateApiKeyNameAction,
    { status: "idle" },
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="apiKeyId" value={apiKeyId} />
      <label htmlFor={`key-name-${apiKeyId}`} className={labelBase}>
        Name
      </label>
      <div className="flex gap-2">
        <input
          id={`key-name-${apiKeyId}`}
          name="name"
          required
          maxLength={80}
          defaultValue={name}
          className={inputBase}
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
