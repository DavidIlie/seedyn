"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import type { MediaDomainChoice } from "~/server/media/origin-preferences";

import { UploadDialog } from "./upload-dialog";
import { useUploadTransfer } from "./use-upload-transfer";

/**
 * The browser upload island.
 *
 * It exists for capabilities a Server Action cannot provide: byte-level upload
 * progress, a real cancel, drag-and-drop, clipboard paste, and a same-browser
 * fetch of an HTTPS URL. Everything it reports is measured — there is no
 * synthetic progress and no optimistic row.
 *
 * The provider lives in the authenticated layout, so a deliberate drop or paste
 * anywhere in the application opens the same state machine every button does.
 */

export type OpenUploadDialogOptions = {
  /** Narrows the operating system file picker only; the server still classifies. */
  accept?: string;
};

type OpenUploadDialog = (options?: OpenUploadDialogOptions) => void;

const UploadDialogContext = createContext<OpenUploadDialog | null>(null);

export function useUploadDialog(): OpenUploadDialog {
  const openDialog = useContext(UploadDialogContext);
  if (!openDialog) {
    throw new Error("The upload trigger must render inside UploadProvider.");
  }
  return openDialog;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }
  // A Radix Select or Command trigger is a <button> with its own typeahead, so
  // the native-element checks above no longer cover it.
  return (
    target.closest(
      '[data-slot="select-trigger"],[role="combobox"],[cmdk-input]',
    ) !== null
  );
}

function clipboardLabel(file: File): string {
  return file.name && file.name !== "image.png" ? file.name : "Clipboard image";
}

export function UploadProvider({
  children,
  mediaDomains,
  directUploadMaxBytes,
}: {
  children: React.ReactNode;
  mediaDomains: MediaDomainChoice[];
  /** The ceiling for a resumable multipart session, from the server env. */
  directUploadMaxBytes: number;
}) {
  const transfer = useUploadTransfer(directUploadMaxBytes);
  const [open, setOpen] = useState(false);
  const [accept, setAccept] = useState<string | undefined>(undefined);

  const { reset, start, isTransferring } = transfer;

  const openDialog = useCallback<OpenUploadDialog>(
    (options) => {
      reset();
      setAccept(options?.accept);
      setOpen(true);
    },
    [reset],
  );

  const close = useCallback(() => {
    setOpen(false);
    setAccept(undefined);
    reset();
  }, [reset]);

  // A file dropped or pasted onto the application at large is an unambiguous
  // instruction, so it uploads on arrival and the dialog opens on the step that
  // reports the result.
  //
  // The listeners stay installed while the dialog is open too, for a reason
  // that has nothing to do with uploading: a file dropped anywhere the browser
  // does not handle navigates the tab to that file, which would abandon a
  // transfer in flight. Cancelling the default is the whole job there.
  useEffect(() => {
    const onDragOver = (event: DragEvent) => {
      if (isEditableTarget(event.target)) return;
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      if (isEditableTarget(event.target)) return;
      const file = event.dataTransfer?.files.item(0);
      if (!file) return;
      event.preventDefault();
      if (isTransferring()) return;
      // Inside the dialog only the first step accepts a drop; the result step
      // has work of its own on screen that a stray drop should not replace.
      if (open && transfer.phase.name !== "idle") return;
      if (!open) {
        reset();
        setAccept(undefined);
        setOpen(true);
      }
      void start(file, file.name || "Dropped file");
    };
    const onPaste = (event: ClipboardEvent) => {
      if (open || isEditableTarget(event.target) || isTransferring()) return;
      const file = event.clipboardData?.files.item(0);
      if (!file) return;
      event.preventDefault();
      reset();
      setAccept(undefined);
      setOpen(true);
      void start(file, clipboardLabel(file));
    };

    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
      document.removeEventListener("paste", onPaste);
    };
  }, [isTransferring, open, reset, start, transfer.phase.name]);

  // Paste inside the open dialog is the same instruction, so it behaves the
  // same way. The file input remains the path that always works.
  useEffect(() => {
    if (!open || transfer.phase.name !== "idle") return undefined;
    const onPaste = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target) || isTransferring()) return;
      const file = event.clipboardData?.files.item(0);
      if (!file) return;
      event.preventDefault();
      void start(file, clipboardLabel(file));
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [isTransferring, open, start, transfer.phase.name]);

  return (
    <UploadDialogContext.Provider value={openDialog}>
      {children}
      <UploadDialog
        open={open}
        accept={accept}
        mediaDomains={mediaDomains}
        transfer={transfer}
        onClose={close}
      />
    </UploadDialogContext.Provider>
  );
}
