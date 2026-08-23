"use client";

import Link from "next/link";

import { Button } from "~/components/ui/button";
import { CopyButton } from "~/components/ui/copy-button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

import type { CreateKeyState } from "./actions";

/**
 * The one moment the secret exists in the browser.
 *
 * Everything here is copyable and nothing is truncated: the dialog refuses to
 * close until the person confirms they stored it, because Seedyn keeps only a
 * hash and cannot show it again.
 */
export function CredentialReveal({
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
              <Button variant="outline" asChild>
                <a href="shottr://settings">Open Shottr settings</a>
              </Button>
            ) : null}
            <Button variant="outline" asChild>
              <Link href="/docs/s3-shottr">Shottr setup guide</Link>
            </Button>
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
            <Button
              type="button"
              variant="outline"
              onClick={downloadShareXConfig}
            >
              Download Seedyn.sxcu
            </Button>
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
        <Button type="button" onClick={onSaved}>
          I saved it
        </Button>
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
