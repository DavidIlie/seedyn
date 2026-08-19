"use client";

import {
  BookOpenIcon,
  KeyRoundIcon,
  SettingsIcon,
  ShieldCheckIcon,
} from "lucide-react";
import type { Route } from "next";

import { GuardedLink } from "~/components/navigation/navigation-blocker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

export type AccountIdentity = {
  name: string | null;
  email: string | null;
  appRole: "MEMBER" | "ADMIN";
};

const accountLinks = [
  { href: "/account", label: "Account", icon: SettingsIcon },
  { href: "/api-keys", label: "API keys", icon: KeyRoundIcon },
  { href: "/docs", label: "Documentation", icon: BookOpenIcon },
] satisfies Array<{
  href: Route;
  label: string;
  icon: typeof SettingsIcon;
}>;

export function AccountMenu({
  identity,
  signOut,
}: {
  identity: AccountIdentity;
  signOut: React.ReactNode;
}) {
  const name = identity.name?.trim() || null;
  const email = identity.email?.trim() || null;
  const displayName = name ?? email ?? "Signed-in user";
  const initial = (email ?? name ?? "U").charAt(0).toLocaleUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="border-border bg-panel hover:border-border-strong hover:bg-sunken grid size-11 shrink-0 place-items-center rounded-lg border transition-[background-color,border-color] lg:size-10"
          aria-label={`Account menu for ${displayName}`}
        >
          <span className="bg-accent/12 text-accent grid size-7 place-items-center rounded-full text-xs font-semibold uppercase">
            {initial}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[min(18rem,calc(100dvw-2rem))] rounded-xl p-1.5"
      >
        <DropdownMenuLabel className="flex min-w-0 items-center gap-3 px-3 py-3 font-normal">
          <span className="bg-accent/12 text-accent grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold uppercase">
            {initial}
          </span>
          <span className="min-w-0">
            <span className="text-muted-foreground block text-xs">
              Signed in as
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium">
                {displayName}
              </span>
              {identity.appRole === "ADMIN" ? (
                <span className="border-accent/30 bg-accent/10 text-accent shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase">
                  Admin
                </span>
              ) : null}
            </span>
            {email && email !== displayName ? (
              <span className="text-muted-foreground block truncate text-xs">
                {email}
              </span>
            ) : null}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {accountLinks.map((item) => (
            <AccountLink key={item.href} {...item} />
          ))}
          {identity.appRole === "ADMIN" ? (
            <AccountLink href="/admin" label="Admin" icon={ShieldCheckIcon} />
          ) : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {signOut}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccountLink({
  href,
  label,
  icon: Icon,
}: {
  href: Route;
  label: string;
  icon: typeof SettingsIcon;
}) {
  return (
    <DropdownMenuItem asChild className="min-h-10 rounded-lg px-3">
      <GuardedLink href={href}>
        <Icon aria-hidden="true" />
        {label}
      </GuardedLink>
    </DropdownMenuItem>
  );
}
