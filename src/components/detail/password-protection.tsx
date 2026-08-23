"use client";

import { LockKeyhole, LockOpen } from "lucide-react";
import { useActionState } from "react";

import { cardSurface } from "~/components/ui/card";
import { HydratedSubmitButton } from "~/components/ui/hydrated-submit-button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

import {
  updatePasswordProtectionAction,
  type PasswordProtectionState,
} from "./password-actions";

export function PasswordProtection({
  uploadId,
  protected: isProtected,
}: {
  uploadId: string;
  protected: boolean;
}) {
  const headingId = `password-heading-${uploadId}`;
  const passwordId = `media-password-${uploadId}`;
  const confirmationId = `media-password-confirmation-${uploadId}`;
  const [state, action] = useActionState<PasswordProtectionState, FormData>(
    updatePasswordProtectionAction,
    { error: null, success: null },
  );

  return (
    <section className={cardSurface} aria-labelledby={headingId}>
      <div className="border-border flex items-start gap-3 border-b p-4">
        <span className="bg-sunken text-accent grid size-9 shrink-0 place-items-center rounded-lg">
          {isProtected ? (
            <LockKeyhole aria-hidden="true" className="size-4" />
          ) : (
            <LockOpen aria-hidden="true" className="size-4" />
          )}
        </span>
        <div>
          <h2 id={headingId} className="text-sm font-medium">
            {isProtected ? "Password protected" : "Anyone with the link"}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm leading-5">
            {isProtected
              ? "Visitors unlock the file before Seedyn serves any bytes."
              : "Add a password when the link should not be enough."}
          </p>
        </div>
      </div>

      <form action={action} className="space-y-4 p-4">
        <input type="hidden" name="uploadId" value={uploadId} />
        <input type="hidden" name="mode" value="set" />
        <div className="space-y-2">
          <Label htmlFor={passwordId}>
            {isProtected ? "New password" : "Password"}
          </Label>
          <Input
            id={passwordId}
            name="password"
            type="password"
            minLength={8}
            maxLength={256}
            autoComplete="new-password"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={confirmationId}>Confirm password</Label>
          <Input
            id={confirmationId}
            name="passwordConfirmation"
            type="password"
            minLength={8}
            maxLength={256}
            autoComplete="new-password"
            required
          />
        </div>
        <p className="text-muted-foreground text-sm">
          At least 8 characters. Changing it immediately expires earlier
          unlocks.
        </p>
        <HydratedSubmitButton
          label={isProtected ? "Change password" : "Protect upload"}
          pendingLabel="Securing…"
          pendingVariant="outline"
          className="w-full"
        />
      </form>

      {isProtected ? (
        <form action={action} className="border-border border-t p-4">
          <input type="hidden" name="uploadId" value={uploadId} />
          <input type="hidden" name="mode" value="remove" />
          <HydratedSubmitButton
            label="Remove password"
            pendingLabel="Removing…"
            variant="outline"
            className="w-full"
          />
        </form>
      ) : null}

      {state.error ? (
        <p
          role="alert"
          className="border-danger text-danger m-4 mt-0 rounded-lg border p-3 text-sm"
        >
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p
          role="status"
          className="border-border bg-sunken m-4 mt-0 rounded-lg border p-3 text-sm"
        >
          {state.success}
        </p>
      ) : null}
    </section>
  );
}
