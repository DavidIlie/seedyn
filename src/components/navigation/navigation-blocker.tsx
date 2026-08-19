"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { buttonPrimary, buttonQuiet } from "~/components/ui/styles";

type NavigationBlockerValue = {
  blocked: boolean;
  setBlocked: (blocked: boolean) => void;
  requestNavigation: (href: Route) => void;
};

const NavigationBlockerContext = createContext<NavigationBlockerValue | null>(
  null,
);

export function NavigationBlockerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [blocked, setBlocked] = useState(false);
  const [pendingHref, setPendingHref] = useState<Route | null>(null);
  const requestNavigation = useCallback(
    (href: Route) => {
      if (!blocked) {
        router.push(href);
        return;
      }
      setPendingHref(href);
    },
    [blocked, router],
  );
  const value = useMemo(
    () => ({ blocked, setBlocked, requestNavigation }),
    [blocked, requestNavigation],
  );

  return (
    <NavigationBlockerContext.Provider value={value}>
      {children}
      <Dialog
        open={pendingHref !== null}
        onOpenChange={(open) => {
          if (!open) setPendingHref(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Leave this draft?</DialogTitle>
            <DialogDescription>
              Your latest changes are saved in this browser and will be restored
              when you return. They have not been published to Seedyn.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className={buttonQuiet}
              onClick={() => setPendingHref(null)}
            >
              Keep editing
            </button>
            <button
              type="button"
              className={buttonPrimary}
              onClick={() => {
                const href = pendingHref;
                if (!href) return;
                setBlocked(false);
                setPendingHref(null);
                router.push(href);
              }}
            >
              Leave editor
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </NavigationBlockerContext.Provider>
  );
}

export function useNavigationBlocker() {
  const value = useContext(NavigationBlockerContext);
  if (!value) {
    throw new Error(
      "useNavigationBlocker must be used inside NavigationBlockerProvider",
    );
  }
  return value;
}

export function GuardedLink({
  href,
  ...props
}: Omit<React.ComponentProps<typeof Link>, "href"> & { href: Route }) {
  const { blocked, requestNavigation } = useNavigationBlocker();
  return (
    <Link
      href={href}
      {...props}
      onNavigate={(event) => {
        props.onNavigate?.(event);
        if (!blocked) return;
        event.preventDefault();
        requestNavigation(href);
      }}
    />
  );
}
