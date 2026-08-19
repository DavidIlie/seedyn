"use client";

import { useState } from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { HydratedSubmitButton } from "~/components/ui/hydrated-submit-button";
import { buttonDanger, buttonQuiet } from "~/components/ui/styles";

import { revokeApiKeyAction } from "./actions";

export function RevokeKeyControl({
  apiKeyId,
  name,
}: {
  apiKeyId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={buttonDanger}>
          Revoke key
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke this key?</DialogTitle>
          <DialogDescription>
            Uploads from {name} stop immediately. Existing links keep working.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <button type="button" className={buttonQuiet}>
              Cancel
            </button>
          </DialogClose>
          <form action={revokeApiKeyAction}>
            <input type="hidden" name="apiKeyId" value={apiKeyId} />
            <HydratedSubmitButton
              label="Revoke key"
              pendingLabel="Revoking…"
              className={buttonDanger}
            />
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
