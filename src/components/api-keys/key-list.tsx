import { formatTimestamp } from "~/components/lib/format";
import { EmptyState } from "~/components/ui/empty-state";
import { cardSurface } from "~/components/ui/card";
import type { ApiKeySummary } from "~/server/api-keys";
import type { MediaDomainChoice } from "~/server/media/origin-preferences";

import { KeyMediaDomainForm } from "./media-domain-form";
import { KeyNameForm } from "./name-form";
import { RevokeKeyControl } from "./revoke-key-control";
import { S3CredentialControl } from "./s3-credential-control";

export function KeyList({
  keys,
  mediaDomains,
}: {
  keys: ApiKeySummary[];
  mediaDomains: MediaDomainChoice[];
}) {
  if (keys.length === 0) {
    return (
      <EmptyState
        title="No API keys"
        body="Create one for ShareX, Shottr, the CLI, or your own uploader."
      />
    );
  }

  return (
    <ul className={cardSurface}>
      {keys.map((key) => (
        <KeyRow key={key.id} apiKey={key} mediaDomains={mediaDomains} />
      ))}
    </ul>
  );
}

function KeyRow({
  apiKey,
  mediaDomains,
}: {
  apiKey: ApiKeySummary;
  mediaDomains: MediaDomainChoice[];
}) {
  const expired = apiKey.expiresAt !== null && apiKey.expiresAt <= new Date();
  const inactive = apiKey.revokedAt !== null || expired;
  const lifecycle = apiKey.revokedAt
    ? "Revoked"
    : expired
      ? "Expired"
      : "Active";

  return (
    <li className="border-border border-b p-4 last:border-b-0">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold">{apiKey.name}</h2>
            <StatusBadge tone={inactive ? "neutral" : "accent"}>
              {lifecycle}
            </StatusBadge>
            {apiKey.s3AccessKeyId ? (
              <StatusBadge tone="accent">S3 enabled</StatusBadge>
            ) : null}
          </div>
          <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-2 text-xs">
            <code className="font-mono">{apiKey.slug}</code>
            <span aria-hidden="true">·</span>
            <span>
              {apiKey.lastUsedAt
                ? "Used " + formatTimestamp(apiKey.lastUsedAt.toISOString())
                : "Not used yet"}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {apiKey.expiresAt
                ? "Expires " + formatTimestamp(apiKey.expiresAt.toISOString())
                : "No expiry"}
            </span>
          </div>
        </div>

        {!inactive ? (
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <details className="group col-span-2 sm:relative sm:col-span-1">
              <summary className="border-border bg-panel hover:border-border-strong hover:bg-sunken inline-flex h-11 w-full cursor-pointer list-none items-center justify-center rounded-lg border px-4 text-sm font-medium transition-colors sm:w-auto md:h-10 [&::-webkit-details-marker]:hidden">
                Manage
              </summary>
              <div className="border-border bg-panel mt-2 rounded-xl border p-3 sm:absolute sm:top-full sm:right-0 sm:z-20 sm:w-[34rem] sm:max-w-[calc(100vw-2rem)]">
                <div className="grid gap-3 sm:grid-cols-2">
                  <KeyNameForm apiKeyId={apiKey.id} name={apiKey.name} />
                  <KeyMediaDomainForm
                    key={apiKey.id + ":" + (apiKey.mediaDomain ?? "account")}
                    apiKeyId={apiKey.id}
                    mediaDomain={apiKey.mediaDomain}
                    mediaDomains={mediaDomains}
                  />
                </div>
                <S3CredentialControl
                  apiKeyId={apiKey.id}
                  accessKeyId={apiKey.s3AccessKeyId}
                  enabledAt={
                    apiKey.s3EnabledAt
                      ? formatTimestamp(apiKey.s3EnabledAt.toISOString())
                      : null
                  }
                  publicBaseUrl={apiKey.s3PublicBaseUrl}
                  publicNamespace={apiKey.s3PublicNamespace}
                />
              </div>
            </details>
            <RevokeKeyControl apiKeyId={apiKey.id} name={apiKey.name} />
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">
            {apiKey.revokedAt
              ? formatTimestamp(apiKey.revokedAt.toISOString())
              : apiKey.expiresAt
                ? formatTimestamp(apiKey.expiresAt.toISOString())
                : null}
          </span>
        )}
      </div>
    </li>
  );
}

function StatusBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "accent" | "neutral";
}) {
  return (
    <span
      className={
        "rounded-full border px-2 py-0.5 text-[0.625rem] font-semibold tracking-wide uppercase " +
        (tone === "accent"
          ? "border-accent/30 bg-accent/10 text-accent"
          : "border-border bg-sunken text-muted-foreground")
      }
    >
      {children}
    </span>
  );
}

export function KeyListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul aria-hidden="true" className={cardSurface}>
      {Array.from({ length: rows }, (_, index) => (
        <li
          key={index}
          className="border-border flex items-center gap-3 border-b px-4 py-4 last:border-b-0"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="bg-border block h-4 w-1/3 rounded" />
            <span className="bg-border block h-3 w-2/3 rounded" />
          </span>
          <span className="border-border h-10 w-36 shrink-0 rounded-lg border" />
        </li>
      ))}
    </ul>
  );
}
