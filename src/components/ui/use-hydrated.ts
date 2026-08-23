"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/**
 * `false` on the server and through hydration, `true` once React is driving.
 *
 * Two things in this application need to render differently before hydration:
 * a Server Action submit that must stay inert until its result can be shown,
 * and a listbox that has to fall back to a native control a form can still
 * operate without JavaScript. Both asked the same question, so they ask it here.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
