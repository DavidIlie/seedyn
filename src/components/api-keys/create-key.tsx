"use client";

import { KeyRoundIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import type { MediaDomainChoice } from "~/server/media/origin-preferences";

import { createApiKeyAction, type CreateKeyState } from "./actions";
import { ConfigureKey } from "./configure-key";
import { CredentialReveal } from "./credential-reveal";
import { KEY_PRESETS, type KeyPreset } from "./presets";

export function CreateKey({
  appOrigin,
  mediaDomains,
}: {
  appOrigin: string;
  mediaDomains: MediaDomainChoice[];
}) {
  const [cycle, setCycle] = useState(0);
  return (
    <CreateKeyDialog
      key={cycle}
      appOrigin={appOrigin}
      mediaDomains={mediaDomains}
      onComplete={() => setCycle((value) => value + 1)}
    />
  );
}

/**
 * Three screens in one dialog: choose a client, name the key, save the secret.
 *
 * The dialog refuses to close while the action is in flight or while the
 * one-time credential is on screen — closing then would lose a secret that
 * cannot be recovered.
 */
function CreateKeyDialog({
  appOrigin,
  mediaDomains,
  onComplete,
}: {
  appOrigin: string;
  mediaDomains: MediaDomainChoice[];
  onComplete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [preset, setPreset] = useState<KeyPreset | null>(null);
  const [state, action, pending] = useActionState<CreateKeyState, FormData>(
    createApiKeyAction,
    { status: "idle" },
  );
  const revealed = state.status === "created";

  function changeOpen(next: boolean) {
    if (!next && (pending || revealed)) return;
    setOpen(next);
    if (!next) setPreset(null);
  }

  function finish() {
    setOpen(false);
    onComplete();
    window.requestAnimationFrame(() => router.refresh());
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button type="button" className="w-full sm:w-auto">
          <KeyRoundIcon aria-hidden="true" className="size-4" />
          New key
        </Button>
      </DialogTrigger>
      <DialogContent
        className="gap-5 sm:max-w-2xl"
        showCloseButton={!pending && !revealed}
        onEscapeKeyDown={(event) => {
          if (pending || revealed) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (pending || revealed) event.preventDefault();
        }}
      >
        {revealed ? (
          <CredentialReveal
            appOrigin={appOrigin}
            state={state}
            onSaved={finish}
          />
        ) : preset ? (
          <ConfigureKey
            action={action}
            error={state.status === "error" ? state.message : null}
            mediaDomains={mediaDomains}
            pending={pending}
            preset={preset}
            onBack={() => setPreset(null)}
          />
        ) : (
          <PresetChooser onSelect={setPreset} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PresetChooser({
  onSelect,
}: {
  onSelect: (preset: KeyPreset) => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Connect a client</DialogTitle>
        <DialogDescription>What will use this credential?</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2 sm:grid-cols-2">
        {KEY_PRESETS.map((preset) => {
          const Icon = preset.icon;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelect(preset)}
              className="border-border bg-panel hover:border-accent hover:bg-accent/5 focus-visible:border-accent flex min-h-20 items-center gap-3 rounded-xl border p-3 text-left transition-[background-color,border-color]"
            >
              <span className="border-border bg-sunken grid size-10 shrink-0 place-items-center rounded-lg border">
                <Icon aria-hidden="true" className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{preset.name}</span>
                <span className="text-muted-foreground mt-0.5 block text-xs">
                  {preset.detail}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-muted-foreground text-xs">
        Just uploading here? Use{" "}
        <Link href="/dashboard" className="text-accent hover:underline">
          Upload
        </Link>
        — no key needed.
      </p>
    </>
  );
}
