"use client";

import { useActionState } from "react";

import { HydratedSubmitButton } from "~/components/ui/hydrated-submit-button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

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
      <Label htmlFor={`key-name-${apiKeyId}`}>Name</Label>
      <div className="flex gap-2">
        <Input
          id={`key-name-${apiKeyId}`}
          name="name"
          required
          maxLength={80}
          defaultValue={name}
        />
        <HydratedSubmitButton
          label="Save"
          pendingLabel="Saving…"
          variant="outline"
          size="sm"
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
