"use client";

import { KeyRound, ShieldCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

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
import { Button } from "~/components/ui/button";

import { rotateS3CredentialAction, type S3CredentialState } from "./actions";

type S3CredentialControlProps = {
  apiKeyId: string;
  accessKeyId: string | null;
  enabledAt: string | null;
  publicBaseUrl: string | null;
  publicNamespace: string | null;
};

type RevealedS3Credential = Extract<S3CredentialState, { status: "revealed" }>;

/**
 * Keeps a returned signing secret mounted only until the reveal closes. The
 * keyed child is then destroyed, dropping the Server Action result from React
 * state; a later reveal always requires a real credential rotation.
 */
export function S3CredentialControl(props: S3CredentialControlProps) {
  const [revealCycle, setRevealCycle] = useState(0);
  const [latestIdentity, setLatestIdentity] = useState<
    Omit<S3CredentialControlProps, "apiKeyId"> | undefined
  >();
  return (
    <S3CredentialDialog
      key={revealCycle}
      {...props}
      {...latestIdentity}
      onSecretConsumed={(credential) => {
        setLatestIdentity({
          accessKeyId: credential.accessKeyId,
          enabledAt: "Just now",
          publicBaseUrl: credential.publicBaseUrl,
          publicNamespace: credential.publicNamespace,
        });
        setRevealCycle((cycle) => cycle + 1);
      }}
    />
  );
}

function S3CredentialDialog({
  apiKeyId,
  accessKeyId,
  enabledAt,
  publicBaseUrl,
  publicNamespace,
  onSecretConsumed,
}: S3CredentialControlProps & {
  onSecretConsumed: (credential: RevealedS3Credential) => void;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, action, pending] = useActionState<S3CredentialState, FormData>(
    rotateS3CredentialAction,
    { status: "idle" },
  );
  const enabled = Boolean(
    accessKeyId && enabledAt && publicBaseUrl && publicNamespace,
  );
  const revealed = state.status === "revealed";

  function changeOpen(next: boolean) {
    if (!next && (pending || revealed)) return;
    setOpen(next);
  }

  function confirmSecretSaved() {
    setOpen(false);
    if (state.status === "revealed") onSecretConsumed(state);
    window.requestAnimationFrame(() => router.refresh());
  }

  return (
    <div className="border-border mt-3 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            {enabled ? (
              <ShieldCheck aria-hidden="true" className="text-accent size-4" />
            ) : (
              <KeyRound
                aria-hidden="true"
                className="text-muted-foreground size-4"
              />
            )}
            Shottr / S3
            <span
              className={
                "rounded-full border px-2 py-0.5 text-[0.625rem] font-semibold tracking-wide uppercase " +
                (enabled
                  ? "border-accent/30 bg-accent/10 text-accent"
                  : "border-border text-muted-foreground")
              }
            >
              {enabled ? "Enabled" : "Not enabled"}
            </span>
          </p>
          {enabled ? (
            <p className="text-muted-foreground mt-1 truncate font-mono text-xs">
              {accessKeyId}
            </p>
          ) : null}
        </div>

        <Dialog open={open} onOpenChange={changeOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              {enabled ? "Rotate credential" : "Set up Shottr"}
            </Button>
          </DialogTrigger>
          <DialogContent
            className="sm:max-w-2xl"
            showCloseButton={!pending && !revealed}
            onEscapeKeyDown={(event) => {
              if (pending || revealed) event.preventDefault();
            }}
            onInteractOutside={(event) => {
              if (pending || revealed) event.preventDefault();
            }}
          >
            {revealed ? (
              <CredentialReveal state={state} onSaved={confirmSecretSaved} />
            ) : (
              <CredentialConfirmation
                action={action}
                apiKeyId={apiKeyId}
                enabled={enabled}
                error={state.status === "error" ? state.message : null}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>

      {enabled ? (
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <SafeFact label="Access Key ID" value={accessKeyId!} code copy />
          <SafeFact
            label="Public Bucket URL"
            value={publicBaseUrl!}
            code
            copy
          />
        </dl>
      ) : null}
      <Link
        href="/docs/s3-shottr"
        className="text-accent mt-3 inline-flex text-xs font-medium underline-offset-4 hover:underline"
      >
        Shottr guide
      </Link>
    </div>
  );
}

function CredentialConfirmation({
  action,
  apiKeyId,
  enabled,
  error,
}: {
  action: (payload: FormData) => void;
  apiKeyId: string;
  enabled: boolean;
  error: string | null;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {enabled ? "Rotate this credential?" : "Set up Shottr / S3?"}
        </DialogTitle>
        <DialogDescription>
          {enabled
            ? "The current client disconnects immediately. Existing media links keep working."
            : "Seedyn creates an Access Key and shows its secret once."}
        </DialogDescription>
      </DialogHeader>

      {enabled ? (
        <div className="border-danger/40 bg-danger/5 flex gap-3 rounded-lg border p-3 text-sm">
          <TriangleAlert
            aria-hidden="true"
            className="text-danger mt-0.5 size-4 shrink-0"
          />
          <p>Save the replacement before closing this dialog.</p>
        </div>
      ) : null}

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
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <form action={action}>
          <input type="hidden" name="apiKeyId" value={apiKeyId} />
          <HydratedSubmitButton
            label={enabled ? "Rotate credential" : "Create credential"}
            pendingLabel={enabled ? "Rotating…" : "Creating…"}
          />
        </form>
      </DialogFooter>
    </>
  );
}

function CredentialReveal({
  state,
  onSaved,
}: {
  state: RevealedS3Credential;
  onSaved: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const setup = [
    "Access key: " + state.accessKeyId,
    "Secret key: " + state.secretAccessKey,
    "Bucket: " + state.bucket,
    "Service: Other",
    "Region: auto",
    "Endpoint: " + state.endpoint,
    "Link sharing: Generate Public Bucket URL",
    "Public Bucket URL: " + state.publicBaseUrl,
  ].join("\n");

  return (
    <>
      <DialogHeader>
        <DialogTitle ref={headingRef} tabIndex={-1}>
          Save this credential
        </DialogTitle>
        <DialogDescription>
          Shown once. Rotating it later disconnects the current client.
        </DialogDescription>
      </DialogHeader>

      <p role="status" aria-live="polite" className="sr-only">
        The S3 credential was generated. Save the values before continuing.
      </p>

      <div className="border-danger/40 bg-danger/5 flex gap-3 rounded-lg border p-3 text-sm">
        <TriangleAlert
          aria-hidden="true"
          className="text-danger mt-0.5 size-4 shrink-0"
        />
        <p>Save the secret before continuing.</p>
      </div>

      <div className="flex justify-end">
        <CopyButton
          value={setup}
          label="Copy complete client setup"
          text="Copy setup"
        />
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <CredentialValue label="Access Key ID" value={state.accessKeyId} />
        <CredentialValue
          label="Secret Access Key"
          value={state.secretAccessKey}
        />
        <CredentialValue label="Bucket" value={state.bucket} />
        <CredentialValue label="Endpoint" value={state.endpoint} />
        <CredentialValue label="Service" value="Other" />
        <CredentialValue label="Region" value="auto" />
        <CredentialValue
          label="Public Bucket URL"
          value={state.publicBaseUrl}
        />
        <CredentialValue
          label="Link sharing"
          value="Generate Public Bucket URL"
        />
      </dl>

      <DialogFooter>
        <Button type="button" onClick={onSaved}>
          I saved it
        </Button>
      </DialogFooter>
    </>
  );
}

function CredentialValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground mb-1.5 text-xs font-medium">
        {label}
      </dt>
      <dd className="flex min-w-0 items-center gap-2">
        <code className="border-border bg-sunken min-w-0 flex-1 rounded-lg border px-3 py-2 font-mono text-xs break-all select-all">
          {value}
        </code>
        <CopyButton value={value} label={`Copy ${label}`} />
      </dd>
    </div>
  );
}

function SafeFact({
  label,
  value,
  code = false,
  copy = false,
}: {
  label: string;
  value: string;
  code?: boolean;
  copy?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 flex min-w-0 items-center gap-1.5">
        <span
          className={
            "min-w-0 truncate " + (code ? "font-mono text-[0.6875rem]" : "")
          }
          title={value}
        >
          {value}
        </span>
        {copy ? <CopyButton value={value} label={`Copy ${label}`} /> : null}
      </dd>
    </div>
  );
}
