"use client";

import { useActionState } from "react";

import { HydratedSubmitButton } from "~/components/ui/hydrated-submit-button";
import { buttonCompact, inputBase } from "~/components/ui/styles";

import {
  updateApiKeyClientLabelAction,
  type UpdateKeyLabelState,
} from "./actions";

export function ClientLabelForm({
  apiKeyId,
  clientLabel,
}: {
  apiKeyId: string;
  clientLabel: string | null;
}) {
  const [state, action] = useActionState<UpdateKeyLabelState, FormData>(
    updateApiKeyClientLabelAction,
    { status: "idle" },
  );

  return (
    <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="apiKeyId" value={apiKeyId} />
      <label htmlFor={`client-label-${apiKeyId}`} className="sr-only">
        Device label
      </label>
      <input
        id={`client-label-${apiKeyId}`}
        name="clientLabel"
        maxLength={80}
        defaultValue={clientLabel ?? ""}
        placeholder="Device label"
        className={`${inputBase} max-w-56`}
      />
      <HydratedSubmitButton
        label="Save label"
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
