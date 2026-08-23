"use client";

import { useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  selectTriggerVariants,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useHydrated } from "~/components/ui/use-hydrated";
import { cn } from "~/lib/utils";

export type FormSelectOption = { value: string; label: string };

/**
 * A Select that a plain form can submit — and that a reader without JavaScript
 * can still operate.
 *
 * Seedyn's filter forms are `next/form` GET forms that are supposed to work
 * before hydration. A listbox cannot do that: Radix renders a button driven by
 * React state, so with scripting off the control looks live and does nothing.
 * Until React is running this therefore renders the native `<select>` it
 * replaces, which submits with the form on its own. After hydration the listbox
 * takes over and mirrors its value into a hidden input, because the applied
 * value has to be in the server-rendered HTML for the unhydrated submit to
 * carry it.
 *
 * Both renderings share `selectTriggerVariants`, so the swap does not move
 * anything.
 *
 * Key the element on the committed value so a back navigation shows the filter
 * that is actually applied.
 */
export function FormSelect({
  id,
  name,
  label,
  options,
  defaultValue,
  className,
  triggerClassName,
}: {
  id?: string;
  name: string;
  /** Announced by the trigger; render a visible `<Label>` instead when there is room. */
  label: string;
  options: readonly FormSelectOption[];
  defaultValue: string;
  className?: string;
  triggerClassName?: string;
}) {
  const hydrated = useHydrated();
  const [value, setValue] = useState(defaultValue);

  if (!hydrated) {
    return (
      <div className={className}>
        <select
          id={id}
          name={name}
          aria-label={label}
          defaultValue={defaultValue}
          data-size="default"
          className={cn(selectTriggerVariants, triggerClassName)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className={className}>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger id={id} aria-label={label} className={triggerClassName}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <input type="hidden" name={name} value={value} readOnly />
    </div>
  );
}
