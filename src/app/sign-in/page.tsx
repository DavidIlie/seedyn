import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { activeProviderLabel } from "~/components/auth/provider";
import { SeedynMark } from "~/components/brand/seedyn-logo";
import { Button } from "~/components/ui/button";
import { getOptionalUser } from "~/server/auth";

import { startSignIn } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

export const instant = true;

/**
 * The sign-in page holds no product data, so its identity and explanation are
 * static and commit immediately. Only two things are request-dependent: whether
 * a session already exists and whether the last attempt failed. Both stream.
 */
export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(24rem,0.82fr)_minmax(32rem,1.18fr)]">
      <section className="bg-background order-1 flex items-center px-6 py-8 sm:px-10 lg:order-2 lg:px-16 lg:py-12 xl:px-24">
        <div className="w-full max-w-[25rem]">
          <div className="mb-12 flex items-center gap-2.5 lg:hidden">
            <SeedynMark className="text-accent size-8" />
            <span className="font-display text-base font-semibold tracking-[-0.025em]">
              Seedyn
            </span>
          </div>

          <h1 className="font-display text-[2rem] leading-tight font-semibold tracking-[-0.035em]">
            Sign in to Seedyn
          </h1>
          <p className="text-muted-foreground mt-3 text-[15px] leading-6">
            Continue with the DavidApps account that has access to this private
            library.
          </p>

          <Suspense fallback={<SignInFallback />}>
            <SignInPanel searchParams={searchParams} />
          </Suspense>

          <div className="border-border mt-8 flex gap-3 border-t pt-5">
            <ShieldGlyph />
            <p className="text-muted-foreground text-sm leading-5">
              Invite-only access is granted through DavidApps and can be revoked
              without changing your stored links.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-brand text-brand-foreground order-2 flex min-h-[22rem] flex-col px-6 py-7 sm:px-10 sm:py-9 lg:order-1 lg:min-h-dvh lg:px-12 lg:py-10 xl:px-16 xl:py-12">
        <div className="hidden items-center gap-2.5 lg:flex">
          <SeedynMark className="size-8" />
          <span className="font-display text-base font-semibold tracking-[-0.025em]">
            Seedyn
          </span>
        </div>

        <div className="my-auto max-w-[34rem] py-10 lg:py-16">
          <h2 className="font-display text-[clamp(2.35rem,5vw,4.75rem)] leading-[0.98] font-semibold tracking-[-0.055em]">
            Upload once.
            <br />
            Keep the link.
          </h2>
          <p className="text-brand-muted mt-6 max-w-[42ch] text-[15px] leading-6 sm:text-base">
            Put any file in one private library, then serve it from a durable
            URL. Use the browser, an API client, or ShareX.
          </p>
        </div>

        <ol className="border-brand-rule grid grid-cols-3 border-t pt-5 text-sm">
          <FlowStep number="01" label="Upload" />
          <FlowStep number="02" label="Store" />
          <FlowStep number="03" label="Serve" />
        </ol>
      </section>
    </main>
  );
}

function FlowStep({ number, label }: { number: string; label: string }) {
  return (
    <li className="flex items-baseline gap-2">
      <span className="text-brand-muted font-mono text-[10px]">{number}</span>
      <span className="font-medium">{label}</span>
    </li>
  );
}

function SignInFallback() {
  return (
    <div
      aria-hidden="true"
      className="bg-border mt-7 h-11 rounded-lg md:h-10"
    />
  );
}

async function SignInPanel({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();

  const params = await searchParams;
  const redirectCandidate = params.redirectTo;
  const redirectTo =
    typeof redirectCandidate === "string" &&
    /^\/cli-auth\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      redirectCandidate,
    )
      ? redirectCandidate
      : "/dashboard";
  if (await getOptionalUser()) {
    if (redirectTo === "/dashboard") redirect("/dashboard");
    redirect(`/cli-auth/${redirectTo.slice("/cli-auth/".length)}`);
  }

  const raw = params.error;
  const code =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;

  return (
    <div className="mt-7 space-y-4">
      {code ? <SignInError code={code} /> : null}

      <form action={startSignIn}>
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <Button type="submit" className="w-full">
          {activeProviderLabel}
        </Button>
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
  const incidentCode = authIncidentCode(code);

  return (
    <div
      role="alert"
      className={
        "rounded-lg border p-3 text-sm " +
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
          <span className="block font-medium">Sign-in did not complete</span>A
          session could not be created. Nothing was changed. Try again. If it
          keeps happening, report incident code{" "}
          <span className="font-mono font-medium">{incidentCode}</span>.
        </>
      )}
    </div>
  );
}

function authIncidentCode(code: string): string {
  const knownCodes: Record<string, string> = {
    Configuration: "AUTH-CFG-01",
    OAuthCallbackError: "AUTH-OIDC-02",
    OAuthAccountNotLinked: "AUTH-LINK-03",
    RateLimited: "AUTH-RATE-04",
    RequestRejected: "AUTH-REQ-05",
  };

  return knownCodes[code] ?? "AUTH-UNKNOWN-00";
}

function ShieldGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-accent mt-0.5 shrink-0"
    >
      <path d="M9 1.75 15 4v4.15c0 3.65-2.4 6.6-6 8.1-3.6-1.5-6-4.45-6-8.1V4z" />
      <path d="m6.5 8.8 1.6 1.6 3.45-3.45" />
    </svg>
  );
}
