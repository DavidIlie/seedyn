"use client";

import { ArrowLeftIcon } from "lucide-react";
import { useId, useState } from "react";

import { MediaDomainSelect } from "~/components/media/media-domain-select";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { HydratedSubmitButton } from "~/components/ui/hydrated-submit-button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { buttonPrimary } from "~/components/ui/styles";
import { apiKeySlugBase } from "~/lib/api-key-slug";
import { API_KEY_SCOPES, type ApiKeyScope } from "~/server/api-keys/constants";
import type { MediaDomainChoice } from "~/server/media/origin-preferences";

import type { KeyPreset } from "./presets";

const SCOPE_COPY: Record<ApiKeyScope, string> = {
  "upload:image": "Images",
  "upload:file": "Files and video",
  "upload:text": "Text",
};

const EXPIRY_OPTIONS = [
  { value: "never", label: "Never" },
  { value: "30", label: "In 30 days" },
  { value: "90", label: "In 90 days" },
] as const;

/**
 * Name the key, pick where its links live, and leave everything else alone.
 *
 * Scopes and expiry sit behind Advanced because their defaults — every upload
 * scope, no expiry — are what a personal client wants. The controls are the
 * shared primitives, so this dialog cannot drift from the account and key
 * management forms that ask the same questions.
 */
export function ConfigureKey({
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
  preset: KeyPreset;
  onBack: () => void;
}) {
  const fieldId = useId();
  const [name, setName] = useState(preset.defaultName);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="preset" value={preset.id} />
      <DialogHeader>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          disabled={pending}
          className="mb-1 -ml-1 h-10 w-fit gap-1 px-1 text-xs md:h-10"
        >
          <ArrowLeftIcon aria-hidden="true" className="size-3.5" />
          Back
        </Button>
        <DialogTitle>Connect {preset.name}</DialogTitle>
        <DialogDescription>One name, one domain, done.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${fieldId}-name`}>Name</Label>
          <Input
            id={`${fieldId}-name`}
            name="name"
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-describedby={`${fieldId}-name-hint`}
          />
          <p
            id={`${fieldId}-name-hint`}
            className="text-muted-foreground text-xs"
          >
            Shown in your upload history.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${fieldId}-domain`}>Link domain</Label>
          <MediaDomainSelect
            id={`${fieldId}-domain`}
            mediaDomains={mediaDomains}
            aria-describedby={`${fieldId}-domain-hint`}
          />
          <p
            id={`${fieldId}-domain-hint`}
            className="text-muted-foreground text-xs"
          >
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
            <legend className="text-foreground text-sm font-medium">
              Uploads
            </legend>
            {API_KEY_SCOPES.map((scope) => (
              <div key={scope} className="flex items-center gap-2">
                <Checkbox
                  id={`${fieldId}-${scope}`}
                  name="scopes"
                  value={scope}
                  defaultChecked
                />
                <Label htmlFor={`${fieldId}-${scope}`} className="font-normal">
                  {SCOPE_COPY[scope]}
                </Label>
              </div>
            ))}
          </fieldset>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`${fieldId}-expiry`}>Expires</Label>
              <Select name="expiry" defaultValue="never">
                <SelectTrigger id={`${fieldId}-expiry`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          <Button type="button" variant="outline" disabled={pending}>
            Cancel
          </Button>
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
