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
        className="text-muted-foreground hover:text-foreground flex h-11 w-full items-center px-3 text-sm md:h-9 md:px-2"
      >
        Sign out
      </button>
    </form>
  );
}
