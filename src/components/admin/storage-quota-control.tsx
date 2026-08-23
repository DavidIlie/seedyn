"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  setUserStorageQuota,
  type StorageQuotaActionState,
} from "~/app/(app)/admin/actions";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import type { AdminUserRow } from "~/server/admin/insights";

const QUOTA_OPTIONS = [
  { value: "default", label: "Default · 5 GB" },
  { value: "10", label: "10 GB" },
  { value: "25", label: "25 GB" },
  { value: "50", label: "50 GB" },
  { value: "100", label: "100 GB" },
  { value: "250", label: "250 GB" },
] as const;

const INITIAL_STATE: StorageQuotaActionState = { status: "idle", message: "" };

export function StorageQuotaControl({ user }: { user: AdminUserRow }) {
  const [state, action] = useActionState(setUserStorageQuota, INITIAL_STATE);
  if (user.appRole === "ADMIN") {
    return (
      <p className="text-muted-foreground text-xs">Unlimited for admins</p>
    );
  }
  const selected = user.storageLimitBytes
    ? String(BigInt(user.storageLimitBytes) / BigInt(1_000_000_000))
    : "default";

  return (
    <form action={action} className="min-w-0">
      <div className="flex items-center gap-1.5">
        <input type="hidden" name="userId" value={user.id} />
        <Select name="limitGb" defaultValue={selected}>
          <SelectTrigger
            aria-label={`Storage limit for ${user.email ?? user.name ?? "user"}`}
            className="min-w-0 flex-1 px-2 text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {QUOTA_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <QuotaSubmitButton />
      </div>
      <p
        aria-live="polite"
        className={
          "mt-1 min-h-4 text-[0.6875rem] " +
          (state.status === "error"
            ? "text-danger"
            : state.status === "success"
              ? "text-[var(--success)]"
              : "text-muted-foreground")
        }
      >
        {state.message}
      </p>
    </form>
  );
}

function QuotaSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="outline"
      disabled={pending}
      className="px-2.5 text-xs font-semibold disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Saving…" : "Set"}
    </Button>
  );
}
