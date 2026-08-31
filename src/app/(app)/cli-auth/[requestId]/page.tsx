import type { Metadata } from "next";

import { requireSessionUser } from "~/components/data/session";
import { Button } from "~/components/ui/button";
import { cardSurface } from "~/components/ui/card";
import { API_KEY_SCOPES } from "~/server/api-keys";
import { readCliAuthRequest } from "~/server/cli-auth/service";

import { approveCliLogin } from "./actions";

export const metadata: Metadata = { title: "Connect Seedyn CLI" };
export const instant = false;

export default async function CliAuthPage({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const { requestId } = await params;
  await requireSessionUser(`/cli-auth/${requestId}`);
  const [request, query] = await Promise.all([
    readCliAuthRequest(requestId),
    searchParams,
  ]);
  const expired = !request || request.expiresAt <= new Date();
  const approved = query.result === "approved" || Boolean(request?.approvedAt);

  return (
    <div className="mx-auto max-w-xl py-12 sm:py-20">
      <section className={`${cardSurface} p-6 sm:p-8`}>
        <p className="text-accent font-mono text-xs tracking-wide uppercase">
          Seedyn CLI
        </p>
        <h1 className="font-display mt-3 text-2xl font-semibold tracking-tight">
          {approved
            ? "CLI connected"
            : expired
              ? "Login request expired"
              : "Connect this CLI?"}
        </h1>

        {approved ? (
          <p className="text-muted-foreground mt-3 leading-6">
            The encrypted credential is waiting for the CLI. You can close this
            page and return to the terminal.
          </p>
        ) : expired ? (
          <p className="text-muted-foreground mt-3 leading-6">
            Return to the terminal and run <code>seedyn auth login</code> again.
          </p>
        ) : (
          <>
            <p className="text-muted-foreground mt-3 leading-6">
              Seedyn will create a new key named <strong>Seedyn CLI</strong> and
              send it to the CLI that opened this page. The key is encrypted to
              that process before it leaves the server.
            </p>
            <div className="border-border bg-sunken mt-6 rounded-lg border p-4">
              <p className="text-sm font-medium">Requested access</p>
              <ul className="text-muted-foreground mt-2 space-y-1 text-sm">
                {API_KEY_SCOPES.map((scope) => (
                  <li key={scope} className="font-mono">
                    {scope}
                  </li>
                ))}
              </ul>
            </div>
            {query.result === "rejected" ? (
              <p className="text-danger mt-4 text-sm" role="alert">
                The request could not be approved. Refresh and try again.
              </p>
            ) : null}
            <form action={approveCliLogin} className="mt-6">
              <input type="hidden" name="requestId" value={requestId} />
              <Button type="submit" className="w-full sm:w-auto">
                Create key and connect CLI
              </Button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
