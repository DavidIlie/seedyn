"use client";

import { useActionState } from "react";

import {
  updateAccountMediaDomainAction,
  type AccountDomainState,
} from "~/app/(app)/account/actions";
import { MediaDomainSelect } from "~/components/media/media-domain-select";
import { Label } from "~/components/ui/label";
import { HydratedSubmitButton } from "~/components/ui/hydrated-submit-button";
import { buttonPrimary } from "~/components/ui/styles";
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
        <Label htmlFor="account-media-domain">Default media domain</Label>
        <MediaDomainSelect
          id="account-media-domain"
          mediaDomains={mediaDomains}
          defaultValue={currentDomain}
          // This form *is* the account default, so it cannot also offer it.
          allowAccountDefault={false}
          aria-describedby="account-media-domain-hint"
          className="sm:max-w-sm"
        />
        <p
          id="account-media-domain-hint"
          className="text-muted-foreground text-sm"
        >
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
