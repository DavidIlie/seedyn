"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { buttonDanger, buttonQuiet, inputBase } from "~/components/ui/styles";
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
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={buttonDanger}
          disabled={user.uploadCount === 0}
        >
          <Trash2 aria-hidden="true" className="size-4" />
          Clear uploads
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader className="pr-10">
          <DialogTitle>Clear this member’s uploads?</DialogTitle>
          <DialogDescription>
            This permanently deletes originals and generated variants. Uploads
            created after the operation begins are preserved.
          </DialogDescription>
        </DialogHeader>

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

        <label className="space-y-2">
          <span className="text-sm font-medium">
            Type <strong className="break-all">{confirmationTarget}</strong> to
            confirm
          </span>
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={started || pending}
            className={inputBase}
          />
        </label>

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

        <DialogFooter>
          <DialogClose asChild>
            <button type="button" className={buttonQuiet} disabled={pending}>
              {operation.done ? "Close" : "Cancel"}
            </button>
          </DialogClose>
          {!operation.done ? (
            <button
              type="button"
              onClick={() => void clearBatch()}
              disabled={!confirmed || pending}
              className={buttonDanger}
            >
              {pending
                ? "Clearing…"
                : started
                  ? "Continue clearing"
                  : "Clear uploads"}
            </button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
