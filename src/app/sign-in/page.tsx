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
      <div className="border-border bg-panel rounded-md border p-6">
        <p className="text-[15px] font-semibold tracking-tight">seedyn</p>

        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          Your private upload library
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          ShareX-ready links, stored for good. Uploads are private to your
          account; the links you share are public to anyone who has them.
        </p>

        <Suspense fallback={<SignInFallback />}>
          <SignInPanel searchParams={searchParams} />
        </Suspense>

        <p className="border-border text-muted-foreground mt-6 border-t pt-4 text-sm">
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
      className="border-border mt-6 h-11 rounded-md border md:h-10"
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
        "rounded-md border p-3 text-sm " +
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
