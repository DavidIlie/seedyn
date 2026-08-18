"use client";

import { useActionState, useState } from "react";

import { CopyButton } from "~/components/ui/copy-button";
import { HydratedSubmitButton } from "~/components/ui/hydrated-submit-button";
import {
  buttonPrimary,
  buttonQuiet,
  inputBase,
  labelBase,
} from "~/components/ui/styles";
import { API_KEY_SCOPES, type ApiKeyScope } from "~/server/api-keys/constants";

import { createApiKeyAction, type CreateKeyState } from "./actions";

/**
 * Create a key, then show it exactly once.
 *
 * The complete key lives in this component's state and nowhere else. It is not
 * written to the URL, to storage, or to a log; it is not fetchable afterwards,
 * because the server keeps only a digest. Dismissing the reveal drops the state,
 * which unmounts every node that held the string — there is no later
 * "download config" that could contain a secret, which is the whole reason the
 * `.sxcu` is generated here, from memory, while the key still exists.
 */

const SCOPE_COPY: Record<ApiKeyScope, string> = {
  "upload:image": "Upload images",
  "upload:file": "Upload files and video",
  "upload:text": "Upload text",
};

export function CreateKey() {
  const [completedName, setCompletedName] = useState<string | null>(null);

  if (completedName !== null) {
    return (
      <div className="border-border rounded-xl border p-4">
        <p className="text-sm">
          <span className="font-medium">{completedName}</span> is active and
          listed below. Its key is gone from this page and cannot be shown
          again.
        </p>
      </div>
    );
  }

  return <CreateKeyForm onDismiss={setCompletedName} />;
}

function CreateKeyForm({ onDismiss }: { onDismiss: (name: string) => void }) {
  const [state, action] = useActionState<CreateKeyState, FormData>(
    createApiKeyAction,
    { status: "idle" },
  );

  if (state.status === "created") {
    return <Reveal state={state} onDismiss={onDismiss} />;
  }

  return (
    <form
      action={action}
      className="border-border space-y-4 rounded-xl border p-4"
    >
      <div className="space-y-2">
        <label htmlFor="key-name" className={labelBase}>
          Name
        </label>
        <input
          id="key-name"
          name="name"
          required
          maxLength={64}
          defaultValue="My uploader"
          aria-describedby="key-name-hint"
          className={`${inputBase} sm:max-w-xs`}
        />
        <p id="key-name-hint" className="text-muted-foreground text-sm">
          Names are unique per account and appear in the list below.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className={labelBase}>Scopes</legend>
        {API_KEY_SCOPES.map((scope) => (
          <label key={scope} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="scopes"
              value={scope}
              defaultChecked
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span>{SCOPE_COPY[scope]}</span>
            <code className="text-muted-foreground font-mono text-xs">
              {scope}
            </code>
          </label>
        ))}
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="key-expiry" className={labelBase}>
          Expires
        </label>
        <select
          id="key-expiry"
          name="expiry"
          defaultValue="never"
          className={`${inputBase} w-auto`}
        >
          <option value="never">Never</option>
          <option value="30">In 30 days</option>
          <option value="90">In 90 days</option>
        </select>
      </div>

      {state.status === "error" ? (
        <p
          role="alert"
          className="border-danger text-danger rounded-lg border p-3 text-sm"
        >
          {state.message}
        </p>
      ) : null}

      <CreateButton />
    </form>
  );
}

function CreateButton() {
  return (
    <HydratedSubmitButton
      label="Create key"
      pendingLabel="Creating…"
      className={buttonPrimary}
    />
  );
}

function Reveal({
  state,
  onDismiss,
}: {
  state: Extract<CreateKeyState, { status: "created" }>;
  onDismiss: (name: string) => void;
}) {
  function downloadConfig() {
    const config = {
      Version: "17.0.0",
      Name: `Seedyn (${state.name})`,
      DestinationType: "ImageUploader, FileUploader, TextUploader",
      RequestMethod: "POST",
      RequestURL: `${window.location.origin}/api/upload`,
      Headers: {
        Authorization: `Bearer ${state.rawKey}`,
        Accept: "application/json",
      },
      Body: "MultipartFormData",
      FileFormName: "file",
      URL: "{json:url}",
      ErrorMessage: "{json:error.message}",
    };

    // Built from the key still held in memory and handed straight to the
    // download. No request is made, so no server, proxy, or cache ever sees it.
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
    <section
      aria-labelledby="reveal-heading"
      className="border-border space-y-4 rounded-xl border p-4"
    >
      <div>
        <h3 id="reveal-heading" className="text-sm font-medium">
          Save this key now
        </h3>
        <p className="text-muted-foreground mt-1 max-w-prose text-sm">
          It is shown once. Seedyn stores only a hash, so nobody — including you
          — can read it again. Copy it for any HTTP client, or download the
          optional ShareX configuration. Both contain a secret.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <code className="border-border bg-sunken min-w-0 flex-1 rounded-lg border px-3 py-2 font-mono text-sm break-all select-all">
          {state.rawKey}
        </code>
        <CopyButton value={state.rawKey} label="Copy the new API key" />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={downloadConfig} className={buttonQuiet}>
          Download Seedyn.sxcu
        </button>
        <button
          type="button"
          onClick={() => onDismiss(state.name)}
          className={buttonPrimary}
        >
          I saved it
        </button>
      </div>
    </section>
  );
}
