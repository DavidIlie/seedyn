"use client";

import type { Route } from "next";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { useEffect, useRef } from "react";

export type AccountIdentity = {
  name: string | null;
  email: string | null;
  appRole: "MEMBER" | "ADMIN";
};

/**
 * A small client boundary around a native disclosure.
 *
 * Identity is read on the server and arrives as two plain strings. The client
 * code only owns interaction polish: close after navigation, close on outside
 * press, and restore focus when Escape dismisses the menu.
 */
export function AccountMenu({
  identity,
  signOut,
}: {
  identity: AccountIdentity;
  signOut: React.ReactNode;
}) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  const segment = useSelectedLayoutSegment();
  const name = identity.name?.trim() || null;
  const email = identity.email?.trim() || null;
  const displayName = name ?? email ?? "Signed-in user";
  const initial = (email ?? name ?? "U").charAt(0).toLocaleUpperCase();

  function closeMenu() {
    if (disclosure.current) disclosure.current.open = false;
  }

  useEffect(closeMenu, [segment]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const menu = disclosure.current;
      if (menu?.open && !menu.contains(event.target as Node)) closeMenu();
    }

    function onKeyDown(event: KeyboardEvent) {
      const menu = disclosure.current;
      if (event.key !== "Escape" || !menu?.open) return;
      event.preventDefault();
      closeMenu();
      menu.querySelector("summary")?.focus();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <details ref={disclosure} className="relative shrink-0">
      <summary
        aria-label={`Account menu for ${displayName}`}
        className="border-border bg-panel hover:border-border-strong hover:bg-sunken grid size-11 cursor-pointer list-none place-items-center rounded-lg border transition-colors lg:size-10 [&::-webkit-details-marker]:hidden"
      >
        <span className="bg-accent/12 text-accent grid size-7 place-items-center rounded-full text-xs font-semibold uppercase">
          {initial}
        </span>
      </summary>

      <div
        role="group"
        aria-label="Account"
        className="border-border bg-panel absolute top-full right-0 z-50 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-xl border p-1.5"
      >
        <div className="flex min-w-0 items-center gap-3 px-3 py-3">
          <span className="bg-accent/12 text-accent grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold uppercase">
            {initial}
          </span>
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs">Signed in as</p>
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-medium">{displayName}</p>
              {identity.appRole === "ADMIN" ? (
                <span className="border-accent/30 bg-accent/10 text-accent shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase">
                  Admin
                </span>
              ) : null}
            </div>
            {email && email !== displayName ? (
              <p className="text-muted-foreground truncate text-xs">{email}</p>
            ) : null}
          </div>
        </div>

        <div className="border-border border-t pt-1">
          <AccountLink
            href="/api-keys"
            label="API keys"
            icon="key"
            close={closeMenu}
          />
          <AccountLink
            href="/docs"
            label="Documentation"
            icon="docs"
            close={closeMenu}
          />
          {identity.appRole === "ADMIN" ? (
            <AccountLink
              href="/admin"
              label="Admin"
              icon="admin"
              close={closeMenu}
            />
          ) : null}
          {signOut}
        </div>
      </div>
    </details>
  );
}

function AccountLink({
  href,
  label,
  icon,
  close,
}: {
  href: Route;
  label: string;
  icon: "key" | "docs" | "admin";
  close: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={close}
      className="text-muted-foreground hover:bg-sunken hover:text-foreground flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors"
    >
      <AccountGlyph name={icon} />
      {label}
    </Link>
  );
}

function AccountGlyph({ name }: { name: "key" | "docs" | "admin" }) {
  if (name === "key") {
    return (
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
        <circle cx="5.25" cy="7" r="3" />
        <path d="m7.75 8.75 5 5M10.25 11.25l1.5-1.5" />
      </svg>
    );
  }

  if (name === "admin") {
    return (
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
        <path d="M8 1.75 13 3.5v3.75c0 3-1.8 5.55-5 7-3.2-1.45-5-4-5-7V3.5z" />
        <path d="m5.75 8 1.5 1.5 3-3" />
      </svg>
    );
  }

  return (
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
      <path d="M2.25 2.5h4.25c1 0 1.5.5 1.5 1.5v9.5c0-1-.5-1.5-1.5-1.5H2.25zM13.75 2.5H9.5C8.5 2.5 8 3 8 4v9.5c0-1 .5-1.5 1.5-1.5h4.25z" />
    </svg>
  );
}
