import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { activeProviderLabel } from "~/components/auth/provider";
import { buttonPrimary } from "~/components/ui/styles";
import { getOptionalUser } from "~/server/auth";

import { startSignIn } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

export const instant = true;

/**
 * The sign-in page holds no product data of any kind, so the whole card is
 * static and commits immediately. Only two things are request-dependent: whether
 * there is already a session, and whether the last attempt failed. Both stream.
 */
export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-16">
      <div>
        <p className="font-mono text-sm font-medium tracking-[-0.02em]">
          seedyn
        </p>

        <h1 className="mt-10 text-[2rem] leading-tight font-semibold tracking-[-0.025em]">
          Files that need a URL
        </h1>
        <p className="text-muted-foreground mt-3 max-w-[38ch] text-[15px] leading-6">
          Upload from the browser or any program. Seedyn stores the object and
          gives it a permanent public-by-link URL.
        </p>

        <Suspense fallback={<SignInFallback />}>
          <SignInPanel searchParams={searchParams} />
        </Suspense>

        <p className="text-muted-foreground mt-8 text-sm leading-5">
          Invite-only. Accounts are granted through DavidApps; there is no
          sign-up form here.
        </p>
      </div>
    </main>
  );
}

function SignInFallback() {
  return (
    <div
      aria-hidden="true"
      className="bg-border mt-6 h-11 rounded-sm md:h-10"
    />
  );
}

async function SignInPanel({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();

  if (await getOptionalUser()) redirect("/dashboard");

  const params = await searchParams;
  const raw = params.error;
  const code =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;

  return (
    <div className="mt-6 space-y-4">
      {code ? <SignInError code={code} /> : null}

      <form action={startSignIn}>
        <button type="submit" className={`${buttonPrimary} w-full`}>
          {activeProviderLabel}
        </button>
      </form>
    </div>
  );
}

/**
 * Two situations, two answers. A denied invite is not a transient failure and
 * must not be presented as one — retrying it forever is the worst outcome.
 */
function SignInError({ code }: { code: string }) {
  const denied = code === "AccessDenied";

  return (
    <div
      role="alert"
      className={
        "rounded-sm border p-3 text-sm " +
        (denied
          ? "border-border text-muted-foreground"
          : "border-danger text-danger")
      }
    >
      {denied ? (
        <>
          <span className="text-foreground block font-medium">
            That account is not invited
          </span>
          Seedyn is invite-only, and admission is managed in DavidApps rather
          than here. Ask David for an invite, then sign in again — or retry with
          a different account.
        </>
      ) : (
        <>
          <span className="block font-medium">Sign-in did not complete</span>
          The identity provider returned an error before a session was created.
          Nothing was changed. Try again.
        </>
      )}
    </div>
  );
}
