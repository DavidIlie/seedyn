"use client";

import { useActionState } from "react";

import {
  updateAccountMediaDomainAction,
  type AccountDomainState,
} from "~/app/(app)/account/actions";
import { HydratedSubmitButton } from "~/components/ui/hydrated-submit-button";
import { buttonPrimary, inputBase, labelBase } from "~/components/ui/styles";
import type { MediaDomainChoice } from "~/server/media/origin-preferences";

export function AccountMediaDomainForm({
  currentDomain,
  mediaDomains,
}: {
  currentDomain: string;
  mediaDomains: MediaDomainChoice[];
}) {
  const [state, action] = useActionState<AccountDomainState, FormData>(
    updateAccountMediaDomainAction,
    { status: "idle" },
  );

  return (
    <form
      action={action}
      className="border-border bg-panel max-w-2xl space-y-4 rounded-xl border p-4 sm:p-5"
    >
      <div className="space-y-2">
        <label htmlFor="account-media-domain" className={labelBase}>
          Default media domain
        </label>
        <select
          id="account-media-domain"
          name="mediaDomain"
          defaultValue={currentDomain}
          className={`${inputBase} sm:max-w-sm`}
        >
          {mediaDomains.map((domain) => (
            <option key={domain.id} value={domain.id}>
              {domain.host}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-sm">
          Browser uploads and API keys set to Account default use this domain.
          Existing uploads keep the domain they were created with.
        </p>
      </div>

      {state.status !== "idle" ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "error"
              ? "text-danger text-sm"
              : "text-muted-foreground text-sm"
          }
        >
          {state.message}
        </p>
      ) : null}

      <HydratedSubmitButton
        label="Save default"
        pendingLabel="Saving…"
        className={buttonPrimary}
      />
    </form>
  );
}
