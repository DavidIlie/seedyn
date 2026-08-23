"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

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
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { AdminUserRow } from "~/server/admin/insights";

type ClearBatch = {
  cutoff: string;
  cursor: string | null;
  done: boolean;
  processedCount: number;
  deletedCount: number;
  totalAtCutoff: number | null;
  failures: Array<{ id: string; name: string; code: string }>;
};

type Operation = {
  cutoff: string | null;
  cursor: string | null;
  done: boolean;
  processed: number;
  deleted: number;
  total: number | null;
  failures: ClearBatch["failures"];
};

const EMPTY_OPERATION: Operation = {
  cutoff: null,
  cursor: null,
  done: false,
  processed: 0,
  deleted: 0,
  total: null,
  failures: [],
};

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: unknown };
    };
    if (typeof body.error?.message === "string") return body.error.message;
  } catch {
    // The generic fallback below deliberately avoids reflecting response text.
  }
  return `Uploads could not be cleared (${response.status}).`;
}

export function ClearUserUploads({ user }: { user: AdminUserRow }) {
  const router = useRouter();
  const confirmationId = useId();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [operation, setOperation] = useState(EMPTY_OPERATION);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmationTarget = user.email ?? user.name ?? user.id;

  if (user.appRole === "ADMIN") {
    return (
      <span className="text-muted-foreground text-xs" title="Admin safeguard">
        Protected
      </span>
    );
  }

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen && pending) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      setConfirmation("");
      setOperation(EMPTY_OPERATION);
      setError(null);
    }
  }

  async function clearBatch() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${user.id}/uploads`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirmation,
          ...(operation.cutoff ? { cutoff: operation.cutoff } : {}),
          ...(operation.cursor ? { cursor: operation.cursor } : {}),
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const batch = (await response.json()) as ClearBatch;
      setOperation((current) => ({
        cutoff: batch.cutoff,
        cursor: batch.cursor,
        done: batch.done,
        processed: current.processed + batch.processedCount,
        deleted: current.deleted + batch.deletedCount,
        total: current.total ?? batch.totalAtCutoff,
        failures: [...current.failures, ...batch.failures],
      }));
      window.dispatchEvent(new Event("seedyn:admin-uploads-changed"));
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Uploads could not be cleared. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  const started = operation.cutoff !== null;
  const confirmed = confirmation.trim() === confirmationTarget;
  const progressTotal = operation.total ?? user.uploadCount;

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="destructive"
          disabled={user.uploadCount === 0}
        >
          <Trash2 aria-hidden="true" className="size-4" />
          Clear uploads
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Clear this member’s uploads?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes originals and generated variants. Uploads
            created after the operation begins are preserved.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="border-danger/35 bg-danger/5 rounded-lg border p-4">
          <p className="text-sm font-medium">
            {user.name ?? user.email ?? "Unnamed member"}
          </p>
          {user.name && user.email ? (
            <p className="text-muted-foreground mt-0.5 text-xs break-all">
              {user.email}
            </p>
          ) : null}
          <p className="text-muted-foreground mt-2 text-sm tabular-nums">
            {user.uploadCount.toLocaleString("en-US")} uploads currently listed
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor={confirmationId}>
            Type <strong className="break-all">{confirmationTarget}</strong> to
            confirm
          </Label>
          <Input
            id={confirmationId}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={started || pending}
          />
        </div>

        {started ? (
          <div className="border-border bg-sunken/45 rounded-lg border p-4 text-sm">
            <p className="font-medium tabular-nums">
              {operation.deleted.toLocaleString("en-US")} of{" "}
              {progressTotal.toLocaleString("en-US")} deleted
            </p>
            <p className="text-muted-foreground mt-1 tabular-nums">
              {operation.processed.toLocaleString("en-US")} checked
              {operation.failures.length > 0
                ? ` · ${operation.failures.length.toLocaleString("en-US")} failed`
                : ""}
            </p>
            {operation.failures.length > 0 ? (
              <ul className="text-danger mt-3 space-y-1 text-xs">
                {operation.failures.slice(-3).map((failure) => (
                  <li key={failure.id} className="break-words">
                    {failure.name} — {failure.code.replaceAll("_", " ")}
                  </li>
                ))}
              </ul>
            ) : null}
            {operation.done ? (
              <p className="mt-3 font-medium">
                {operation.failures.length > 0
                  ? "Finished with failures. The failed rows remain available for a retry."
                  : "All uploads in the cutoff were removed."}
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {operation.done ? "Close" : "Cancel"}
          </AlertDialogCancel>
          {!operation.done ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => void clearBatch()}
              disabled={!confirmed || pending}
            >
              {pending
                ? "Clearing…"
                : started
                  ? "Continue clearing"
                  : "Clear uploads"}
            </Button>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
