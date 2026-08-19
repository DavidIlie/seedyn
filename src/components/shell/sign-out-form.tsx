import { LogOutIcon } from "lucide-react";

import { DropdownMenuItem } from "~/components/ui/dropdown-menu";

import { signOutAction } from "./auth-actions";

/**
 * A real form posting to a Server Action, so signing out works before (and
 * without) hydration. It is not one of the six navigation links: it does not
 * navigate, it mutates.
 */
export function SignOutForm({ className = "" }: { className?: string }) {
  return (
    <form action={signOutAction} className={className}>
      <DropdownMenuItem asChild className="min-h-10 rounded-lg px-3">
        <button type="submit" className="w-full">
          <LogOutIcon aria-hidden="true" />
          Sign out
        </button>
      </DropdownMenuItem>
    </form>
  );
}
