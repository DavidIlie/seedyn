import { signOutAction } from "./auth-actions";

/**
 * A real form posting to a Server Action, so signing out works before (and
 * without) hydration. It is not one of the six navigation links: it does not
 * navigate, it mutates.
 */
export function SignOutForm({ className = "" }: { className?: string }) {
  return (
    <form action={signOutAction} className={className}>
      <button
        type="submit"
        className="text-muted-foreground hover:bg-sunken hover:text-foreground flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm transition-colors"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 2.25H3.75A1.75 1.75 0 0 0 2 4v8a1.75 1.75 0 0 0 1.75 1.75H6M9.75 4.5 13.25 8l-3.5 3.5M13 8H6" />
        </svg>
        Sign out
      </button>
    </form>
  );
}
