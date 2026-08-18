"use client";

import { useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";

const subscribe = () => () => undefined;

/** Keep sensitive Server Actions inert until React can render their result. */
export function HydratedSubmitButton({
  label,
  pendingLabel,
  className,
  pendingClassName = className,
}: {
  label: string;
  pendingLabel: string;
  className: string;
  pendingClassName?: string;
}) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!hydrated || pending}
      className={pending ? pendingClassName : className}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
