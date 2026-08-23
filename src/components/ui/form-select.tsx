"use client";

import { useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

export type FormSelectOption = { value: string; label: string };

/**
 * A Select that a plain form can submit.
 *
 * Seedyn's filter forms are `next/form` GET forms that are supposed to work
 * before hydration. Radix only renders its own hidden native select on the
 * client, and its value is React state, so an unhydrated submit would drop the
 * field. Mirroring the selection into a hidden input instead puts the applied
 * value in the server-rendered HTML: without JavaScript the form still submits
 * the current selection, and with JavaScript the listbox drives it.
 *
 * Key the element on the committed value so a back navigation shows the
 * filter that is actually applied.
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
  const [value, setValue] = useState(defaultValue);

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
