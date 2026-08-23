"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { HydratedSubmitButton } from "~/components/ui/hydrated-submit-button";

import { revokeApiKeyAction } from "./actions";

/**
 * Revocation is irreversible, so it is an alert dialog rather than a plain one:
 * the prompt takes focus, traps it, and cannot be dismissed by clicking past it.
 *
 * The confirm control is the form's own submit button rather than
 * `AlertDialogAction`, because that primitive closes the dialog on click and
 * would unmount the Server Action form mid-submit.
 */
export function RevokeKeyControl({
  apiKeyId,
  name,
}: {
  apiKeyId: string;
  name: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive">
          Revoke key
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke this key?</AlertDialogTitle>
          <AlertDialogDescription>
            Uploads from {name} stop immediately. Existing links keep working.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <form action={revokeApiKeyAction}>
            <input type="hidden" name="apiKeyId" value={apiKeyId} />
            <HydratedSubmitButton
              label="Revoke key"
              pendingLabel="Revoking…"
              variant="destructive"
            />
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
