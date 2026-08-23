"use client";

import { useActionState } from "react";

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

import { deleteUploadAction, type DeleteState } from "./delete-actions";

/**
 * Deletion, behind an alert dialog.
 *
 * This was a `<details>` disclosure, which put an armed destructive button one
 * click from the page and let a stray click past it go unnoticed. Deleting is
 * irreversible and it is the only action on this page that is, so it gets the
 * primitive built for irreversible actions: focus moves into the prompt, stays
 * there, and the dialog cannot be dismissed by clicking the backdrop.
 *
 * The confirm control is the form's own submit rather than
 * `AlertDialogAction`, which closes the dialog on click and would unmount the
 * Server Action form mid-submit. A failure therefore stays on screen with its
 * message; a success redirects away.
 */
export function DeleteUpload({
  uploadId,
  filename,
}: {
  uploadId: string;
  filename: string;
}) {
  const [state, action] = useActionState<DeleteState, FormData>(
    deleteUploadAction,
    { error: null },
  );

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive">
          Delete this upload…
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this upload?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes <span className="font-medium">{filename}</span> and any
            stored GIF variant. The URLs stop working immediately at the origin,
            but anyone who already has the link may still be served the bytes by
            an edge cache for up to 24 hours.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {state.error ? (
          <p
            role="alert"
            className="border-danger text-danger rounded-lg border p-3 text-sm"
          >
            {state.error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep upload</AlertDialogCancel>
          <form action={action}>
            <input type="hidden" name="uploadId" value={uploadId} />
            <HydratedSubmitButton
              label="Delete permanently"
              pendingLabel="Deleting…"
              variant="destructive"
              pendingVariant="outline"
            />
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
