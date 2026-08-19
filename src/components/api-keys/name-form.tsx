"use client";

import { useActionState } from "react";

import { HydratedSubmitButton } from "~/components/ui/hydrated-submit-button";
import { buttonCompact, inputBase } from "~/components/ui/styles";

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
    <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="apiKeyId" value={apiKeyId} />
      <label htmlFor={`key-name-${apiKeyId}`} className="sr-only">
        Credential name
      </label>
      <input
        id={`key-name-${apiKeyId}`}
        name="name"
        required
        maxLength={80}
        defaultValue={name}
        className={`${inputBase} max-w-64`}
      />
      <HydratedSubmitButton
        label="Save name"
        pendingLabel="Saving…"
        className={buttonCompact}
      />
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
