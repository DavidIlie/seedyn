import { formatTimestamp } from "~/components/lib/format";
import { EmptyState } from "~/components/ui/empty-state";
import { HydratedSubmitButton } from "~/components/ui/hydrated-submit-button";
import { buttonCompact, panelSurface } from "~/components/ui/styles";
import type { ApiKeySummary } from "~/server/api-keys";
import type { MediaDomainChoice } from "~/server/media/origin-preferences";

import { revokeApiKeyAction } from "./actions";
import { KeyNameForm } from "./name-form";
import { KeyMediaDomainForm } from "./media-domain-form";
import { S3CredentialControl } from "./s3-credential-control";

/**
 * The stored view of a key: its display prefix, its scopes, and its lifecycle.
 *
 * There is no "download config" here. Any file that would let ShareX
 * authenticate has to contain the key, and the key no longer exists on the
 * server — only its digest does. Offering a secret-free template from this row
 * would be offering a file that does not work.
 */
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
        body="Create a named key above. For an S3 client, use Enable S3 on the new key to reveal its Access Key ID and Secret Access Key."
      />
    );
  }

  return (
    <ul className={panelSurface}>
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

  return (
    <li className="border-border flex flex-wrap items-center gap-3 border-b px-3 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
          <span className="font-medium">{apiKey.name}</span>
          <code className="text-muted-foreground font-mono text-xs">
            {apiKey.slug}
          </code>
          <code className="text-muted-foreground font-mono text-xs">
            {apiKey.prefix}…
          </code>
          <span className="text-muted-foreground text-xs">
            {apiKey.scopes.join(", ") || "no scopes"}
          </span>
        </p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {apiKey.revokedAt
            ? `Revoked ${formatTimestamp(apiKey.revokedAt.toISOString())}`
            : expired
              ? `Expired ${formatTimestamp(apiKey.expiresAt!.toISOString())}`
              : apiKey.expiresAt
                ? `Expires ${formatTimestamp(apiKey.expiresAt.toISOString())}`
                : "Never expires"}
          {" · "}
          {apiKey.lastUsedAt
            ? `Last used ${formatTimestamp(apiKey.lastUsedAt.toISOString())}`
            : "Never used"}
          {" · "}
          {`Created ${formatTimestamp(apiKey.createdAt.toISOString())}`}
        </p>
        {!inactive ? (
          <>
            <KeyNameForm apiKeyId={apiKey.id} name={apiKey.name} />
            <KeyMediaDomainForm
              key={`${apiKey.id}:${apiKey.mediaDomain ?? "account"}`}
              apiKeyId={apiKey.id}
              mediaDomain={apiKey.mediaDomain}
              mediaDomains={mediaDomains}
            />
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
          </>
        ) : null}
      </div>

      {inactive ? (
        <span className="text-muted-foreground text-xs">Inactive</span>
      ) : (
        <form action={revokeApiKeyAction}>
          <input type="hidden" name="apiKeyId" value={apiKey.id} />
          <HydratedSubmitButton
            label="Revoke"
            pendingLabel="Revoking…"
            className={buttonCompact}
          />
        </form>
      )}
    </li>
  );
}

export function KeyListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul aria-hidden="true" className={panelSurface}>
      {Array.from({ length: rows }, (_, index) => (
        <li
          key={index}
          className="border-border flex items-center gap-3 border-b px-3 py-3 last:border-b-0"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="bg-border block h-4 w-1/2 rounded" />
            <span className="bg-border block h-3 w-3/4 rounded" />
          </span>
          <span className="border-border h-11 w-20 shrink-0 rounded-lg border md:h-9" />
        </li>
      ))}
    </ul>
  );
}
