"use client";

import { useActionState } from "react";

import { HydratedSubmitButton } from "~/components/ui/hydrated-submit-button";
import { buttonDanger, buttonQuiet } from "~/components/ui/styles";

import { deleteUploadAction, type DeleteState } from "./delete-actions";

/**
 * Deletion, behind a native disclosure.
 *
 * The confirmation is a `<details>` rather than a modal because it never has to
 * interrupt. The destructive action stays disabled until hydration because its
 * result requires React; this client boundary also reports whether the
 * submission is in flight and any error from the last attempt.
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
    <details className="border-border rounded-xl border">
      <summary className="flex h-12 cursor-pointer list-none items-center px-4 text-sm [&::-webkit-details-marker]:hidden">
        Delete this upload…
      </summary>
      <div className="border-border space-y-3 border-t p-4">
        <p className="text-muted-foreground max-w-prose text-sm">
          Deleting removes <span className="font-medium">{filename}</span> and
          any stored GIF variant. The URLs stop working immediately at the
          origin, but anyone who already has the link may still be served the
          bytes by an edge cache for up to 24 hours.
        </p>
        <form action={action}>
          <input type="hidden" name="uploadId" value={uploadId} />
          <DeleteButton />
        </form>
        {state.error ? (
          <p
            role="alert"
            className="border-danger text-danger rounded-lg border p-3 text-sm"
          >
            {state.error}
          </p>
        ) : null}
      </div>
    </details>
  );
}

function DeleteButton() {
  return (
    <HydratedSubmitButton
      label="Delete permanently"
      pendingLabel="Deleting…"
      className={buttonDanger}
      pendingClassName={buttonQuiet}
    />
  );
}
