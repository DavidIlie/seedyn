"use client";

import { FileUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import type { MediaDomainChoice } from "~/server/media/origin-preferences";

import { ChooseStep } from "./steps/choose-step";
import { ResultStep } from "./steps/result-step";
import { TransferStep } from "./steps/transfer-step";
import type { UploadTransfer } from "./use-upload-transfer";

/**
 * Three steps, one at a time.
 *
 * Choosing a file starts the transfer immediately — there is no second
 * confirm button for a decision already made — and everything optional lives
 * on the result step, where it applies to an object that exists and can be
 * changed or ignored.
 */

const STEP_COPY = {
  choose: {
    title: "Upload",
    description: "Drop a file, paste one, or import a public HTTPS URL.",
  },
  transfer: { title: "Uploading", description: "Keep this dialog open." },
  done: {
    title: "Upload complete",
    description: "Copy the link, or change it below.",
  },
} as const;

export function UploadDialog({
  open,
  accept,
  mediaDomains,
  transfer,
  onClose,
}: {
  open: boolean;
  accept: string | undefined;
  mediaDomains: MediaDomainChoice[];
  transfer: UploadTransfer;
  onClose: () => void;
}) {
  const browseButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [gifBusy, setGifBusy] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const { phase } = transfer;
  const busy = transfer.transferring || gifBusy;
  const step =
    phase.name === "done"
      ? "done"
      : phase.name === "idle"
        ? "choose"
        : "transfer";
  const copy = STEP_COPY[step];

  useEffect(() => {
    if (open) {
      returnFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    }
  }, [open]);

  // "Upload another" replaces the whole panel, so focus follows the step back
  // to the control that starts the next one.
  const previousStep = useRef(step);
  useEffect(() => {
    if (open && step === "choose" && previousStep.current !== "choose") {
      browseButton.current?.focus();
    }
    previousStep.current = step;
  }, [open, step]);

  useEffect(() => {
    if (!busy) setConfirmingCancel(false);
  }, [busy]);

  useEffect(() => {
    if (!busy) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [busy]);

  function close() {
    if (busy) {
      setConfirmingCancel(true);
      return;
    }
    setGifBusy(false);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close();
      }}
    >
      <DialogContent
        onOpenAutoFocus={(event) => {
          if (phase.name !== "idle") return;
          event.preventDefault();
          browseButton.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (!busy) return;
          event.preventDefault();
          setConfirmingCancel(true);
        }}
        onPointerDownOutside={(event) => {
          if (!busy) return;
          event.preventDefault();
          setConfirmingCancel(true);
        }}
        className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogHeader className="border-border border-b px-5 py-4 pr-16">
          <div className="flex items-start gap-3">
            <span className="border-border bg-sunken text-accent grid size-10 shrink-0 place-items-center rounded-lg border">
              <FileUp className="size-[18px]" aria-hidden="true" />
            </span>
            <div className="min-w-0 space-y-1">
              <DialogTitle>{copy.title}</DialogTitle>
              <DialogDescription>{copy.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto overscroll-contain p-5">
          {/* A step change is a page change for anyone not looking at it. */}
          <p role="status" aria-live="polite" className="sr-only">
            {copy.title}
          </p>

          {phase.name === "idle" ? (
            <ChooseStep
              accept={accept}
              busy={busy}
              failure={transfer.failure}
              browseRef={browseButton}
              onFile={(file) => void transfer.start(file, file.name || "File")}
              onIngestUrl={(value) => void transfer.ingestUrl(value)}
            />
          ) : null}

          {phase.name === "uploading" || phase.name === "fetching" ? (
            <TransferStep
              kind={phase.name}
              label={phase.label}
              loaded={phase.loaded}
              total={phase.total}
              onCancel={transfer.cancel}
            />
          ) : null}

          {phase.name === "done" ? (
            <ResultStep
              record={phase.record}
              label={phase.label}
              file={phase.file}
              mediaDomains={mediaDomains}
              busy={busy}
              onBusyChange={setGifBusy}
              onUploadAnother={() => {
                setGifBusy(false);
                transfer.reset();
              }}
              onDone={() => {
                setGifBusy(false);
                onClose();
              }}
            />
          ) : null}
        </div>
      </DialogContent>

      <AlertDialog open={confirmingCancel} onOpenChange={setConfirmingCancel}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this transfer?</AlertDialogTitle>
            <AlertDialogDescription>
              {phase.name === "done"
                ? "Closing now stops the GIF operation. The original URL stays stored."
                : "Closing now stops the transfer. Nothing incomplete is added to your library."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep working</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                transfer.cancel();
                setGifBusy(false);
                setConfirmingCancel(false);
                onClose();
              }}
            >
              Cancel and close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
