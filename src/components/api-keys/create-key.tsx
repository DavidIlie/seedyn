"use client";

import {
  ArrowLeftIcon,
  Code2Icon,
  ImagesIcon,
  KeyRoundIcon,
  PackageOpenIcon,
} from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { CopyButton } from "~/components/ui/copy-button";
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
import {
  buttonPrimary,
  buttonQuiet,
  inputBase,
  labelBase,
} from "~/components/ui/styles";
import { apiKeySlugBase } from "~/lib/api-key-slug";
import { API_KEY_SCOPES, type ApiKeyScope } from "~/server/api-keys/constants";
import type { MediaDomainChoice } from "~/server/media/origin-preferences";

import { createApiKeyAction, type CreateKeyState } from "./actions";
import type { ClientPresetId } from "./client-presets";

type Preset = Readonly<{
  id: ClientPresetId;
  name: string;
  detail: string;
  defaultName: string;
  icon: typeof Code2Icon;
}>;

const PRESETS: readonly Preset[] = [
  {
    id: "http",
    name: "HTTP API",
    detail: "curl, scripts, and the CLI",
    defaultName: "My API client",
    icon: Code2Icon,
  },
  {
    id: "sharex",
    name: "ShareX",
    detail: "Ready-to-import Windows config",
    defaultName: "ShareX on my PC",
    icon: ImagesIcon,
  },
  {
    id: "shottr",
    name: "Shottr",
    detail: "S3 setup for macOS",
    defaultName: "Shottr on my Mac",
    icon: KeyRoundIcon,
  },
  {
    id: "s3",
    name: "S3-compatible",
    detail: "Any path-style S3 client",
    defaultName: "My S3 client",
    icon: PackageOpenIcon,
  },
] as const;

const SCOPE_COPY: Record<ApiKeyScope, string> = {
  "upload:image": "Images",
  "upload:file": "Files and video",
  "upload:text": "Text",
};

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
  const [preset, setPreset] = useState<Preset | null>(null);
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
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <button type="button" className={buttonPrimary + " w-full sm:w-auto"}>
          <KeyRoundIcon aria-hidden="true" className="size-4" />
          New key
        </button>
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

function PresetChooser({ onSelect }: { onSelect: (preset: Preset) => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Connect a client</DialogTitle>
        <DialogDescription>What will use this credential?</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2 sm:grid-cols-2">
        {PRESETS.map((preset) => {
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

function ConfigureKey({
  action,
  error,
  mediaDomains,
  pending,
  preset,
  onBack,
}: {
  action: (payload: FormData) => void;
  error: string | null;
  mediaDomains: MediaDomainChoice[];
  pending: boolean;
  preset: Preset;
  onBack: () => void;
}) {
  const [name, setName] = useState(preset.defaultName);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="preset" value={preset.id} />
      <DialogHeader>
        <button
          type="button"
          onClick={onBack}
          disabled={pending}
          className="text-muted-foreground hover:text-foreground mb-1 -ml-1 inline-flex h-10 w-fit items-center gap-1 px-1 text-xs font-medium disabled:opacity-50"
        >
          <ArrowLeftIcon aria-hidden="true" className="size-3.5" />
          Back
        </button>
        <DialogTitle>Connect {preset.name}</DialogTitle>
        <DialogDescription>One name, one domain, done.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="key-name" className={labelBase}>
            Name
          </label>
          <input
            id="key-name"
            name="name"
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputBase}
          />
          <p className="text-muted-foreground text-xs">
            Shown in your upload history.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="key-media-domain" className={labelBase}>
            Link domain
          </label>
          <select
            id="key-media-domain"
            name="mediaDomain"
            defaultValue=""
            className={inputBase}
          >
            <option value="">Account default</option>
            {mediaDomains.map((domain) => (
              <option key={domain.id} value={domain.id}>
                {domain.host}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">
            Links from this key use this domain.
          </p>
        </div>
      </div>

      <details className="border-border rounded-lg border">
        <summary className="hover:bg-sunken cursor-pointer rounded-lg px-3 py-2.5 text-sm font-medium">
          Advanced
        </summary>
        <div className="border-border grid gap-4 border-t p-3 sm:grid-cols-2">
          <fieldset className="space-y-2">
            <legend className={labelBase}>Uploads</legend>
            {API_KEY_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="scopes"
                  value={scope}
                  defaultChecked
                  className="size-4 accent-[var(--accent)]"
                />
                {SCOPE_COPY[scope]}
              </label>
            ))}
          </fieldset>
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="key-expiry" className={labelBase}>
                Expires
              </label>
              <select
                id="key-expiry"
                name="expiry"
                defaultValue="never"
                className={inputBase}
              >
                <option value="never">Never</option>
                <option value="30">In 30 days</option>
                <option value="90">In 90 days</option>
              </select>
            </div>
            <p className="text-muted-foreground text-xs">
              ID{" "}
              <code className="text-foreground font-mono break-all">
                {apiKeySlugBase(name)}
              </code>
            </p>
          </div>
        </div>
      </details>

      {error ? (
        <p
          role="alert"
          className="border-danger bg-danger/5 text-danger rounded-lg border p-3 text-sm"
        >
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <DialogClose asChild>
          <button type="button" className={buttonQuiet} disabled={pending}>
            Cancel
          </button>
        </DialogClose>
        <HydratedSubmitButton
          label="Create key"
          pendingLabel="Creating…"
          className={buttonPrimary}
        />
      </DialogFooter>
    </form>
  );
}

function CredentialReveal({
  appOrigin,
  state,
  onSaved,
}: {
  appOrigin: string;
  state: Extract<CreateKeyState, { status: "created" }>;
  onSaved: () => void;
}) {
  const endpoint = appOrigin + "/api/upload";
  const s3 = state.s3Credential;
  const setup = s3
    ? [
        "Access key: " + s3.accessKeyId,
        "Secret key: " + s3.secretAccessKey,
        "Bucket: " + s3.bucket,
        "Service: Other",
        "Region: auto",
        "Endpoint: " + s3.endpoint,
        "Link sharing: Generate Public Bucket URL",
        "Public Bucket URL: " + s3.publicBaseUrl,
      ].join("\n")
    : "Endpoint: " + endpoint + "\nAuthorization: Bearer " + state.rawKey;

  function downloadShareXConfig() {
    const config = {
      Version: "17.0.0",
      Name: "Seedyn (" + state.name + ")",
      DestinationType: "ImageUploader, FileUploader, TextUploader",
      RequestMethod: "POST",
      RequestURL: endpoint,
      Headers: {
        Authorization: "Bearer " + state.rawKey,
        Accept: "application/json",
      },
      Body: "MultipartFormData",
      FileFormName: "file",
      URL: "{json:url}",
      ErrorMessage: "{json:error.message}",
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: "application/json",
    });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "Seedyn.sxcu";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{state.name} is ready</DialogTitle>
        <DialogDescription>
          Shown once. Seedyn keeps only a hash.
        </DialogDescription>
      </DialogHeader>

      <div className="border-accent/30 bg-accent/5 rounded-xl border p-3">
        <CredentialValue label="API key" value={state.rawKey} />
      </div>

      {s3 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">
              {state.preset === "shottr" ? "Shottr setup" : "S3 setup"}
            </h3>
            <CopyButton
              value={setup}
              label="Copy complete client setup"
              text="Copy setup"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <CredentialValue label="Access key" value={s3.accessKeyId} />
            <CredentialValue label="Secret key" value={s3.secretAccessKey} />
            <CredentialValue label="Bucket" value={s3.bucket} />
            <CredentialValue label="Endpoint" value={s3.endpoint} />
            <CredentialValue label="Region" value="auto" />
            <CredentialValue label="Service" value="Other" />
            <CredentialValue label="Key prefix (path)" value="Optional" />
            <CredentialValue
              label="Link sharing"
              value="Generate Public Bucket URL"
            />
          </div>
          <CredentialValue label="Public Bucket URL" value={s3.publicBaseUrl} />
          <div className="flex flex-wrap gap-2">
            {state.preset === "shottr" ? (
              <a href="shottr://settings" className={buttonQuiet}>
                Open Shottr settings
              </a>
            ) : null}
            <Link href="/docs/s3-shottr" className={buttonQuiet}>
              Shottr setup guide
            </Link>
          </div>
        </div>
      ) : state.preset === "shottr" || state.preset === "s3" ? null : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">HTTP setup</h3>
            <CopyButton
              value={setup}
              label="Copy HTTP API setup"
              text="Copy setup"
            />
          </div>
          <CredentialValue label="Endpoint" value={endpoint} />
          {state.preset === "sharex" ? (
            <button
              type="button"
              onClick={downloadShareXConfig}
              className={buttonQuiet}
            >
              Download Seedyn.sxcu
            </button>
          ) : null}
        </div>
      )}

      {state.s3Error ? (
        <p
          role="alert"
          className="border-danger bg-danger/5 text-danger rounded-lg border p-3 text-sm"
        >
          {state.s3Error} The API key above is still active; enable S3 from its
          Manage panel.
        </p>
      ) : null}

      <DialogFooter className="bg-panel sticky -bottom-4 -mx-4 border-t px-4 pt-4 pb-4 sm:-bottom-6 sm:-mx-6 sm:px-6 sm:pb-6">
        <button type="button" className={buttonPrimary} onClick={onSaved}>
          I saved it
        </button>
      </DialogFooter>
    </>
  );
}

function CredentialValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground mb-1 text-xs font-medium">{label}</p>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <code className="border-border bg-sunken min-w-0 flex-1 rounded-lg border px-3 py-2 font-mono text-xs break-all select-all">
          {value}
        </code>
        <CopyButton value={value} label={"Copy " + label} />
      </div>
    </div>
  );
}
