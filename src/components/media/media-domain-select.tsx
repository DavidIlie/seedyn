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
import type { MediaDomainChoice } from "~/server/media/origin-preferences";

/** The wire value that means "resolve the account preference server-side". */
export const ACCOUNT_DEFAULT_MEDIA_DOMAIN = "";

/**
 * Radix rejects an empty `SelectItem` value, so "account default" travels
 * through the listbox under a sentinel and is translated back at every edge.
 */
const ACCOUNT_DEFAULT_ITEM = "__account_default__";

const toItem = (wire: string) =>
  wire === ACCOUNT_DEFAULT_MEDIA_DOMAIN ? ACCOUNT_DEFAULT_ITEM : wire;
const toWire = (item: string) =>
  item === ACCOUNT_DEFAULT_ITEM ? ACCOUNT_DEFAULT_MEDIA_DOMAIN : item;

/**
 * The one media-domain picker.
 *
 * Four surfaces asked the same question with four hand-written selects — the
 * account default, an API key's link domain, key creation, and the upload
 * flow — so the option list, the "Account default" wording and the submitted
 * field name were free to drift. They share this control now.
 *
 * When `name` is set the selection is mirrored into a hidden input rather than
 * Radix's own hidden select, because the server's wire format for "account
 * default" is the empty string and the listbox cannot carry that value. The
 * input is present in the server-rendered HTML, so a form submitted before
 * hydration still posts the currently selected domain.
 *
 * `allowAccountDefault` is false on the account form itself, where the account
 * default is the thing being chosen and so cannot also be an option.
 */
export function MediaDomainSelect({
  id,
  name = "mediaDomain",
  mediaDomains,
  defaultValue = ACCOUNT_DEFAULT_MEDIA_DOMAIN,
  value,
  onValueChange,
  allowAccountDefault = true,
  disabled = false,
  className,
  "aria-describedby": ariaDescribedBy,
}: {
  id?: string;
  /** Set to `null` to submit nothing, e.g. inside a non-form dialog. */
  name?: string | null;
  mediaDomains: MediaDomainChoice[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  allowAccountDefault?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-describedby"?: string;
}) {
  const hydrated = useHydrated();
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const selected = value ?? uncontrolled;

  // Before hydration the listbox is a button that does nothing, so these forms
  // render the native control they replace. It needs no sentinel: an `<option>`
  // carries the empty string that means "account default" perfectly well.
  if (!hydrated && name) {
    return (
      <select
        id={id}
        name={name}
        defaultValue={selected}
        disabled={disabled}
        aria-describedby={ariaDescribedBy}
        data-size="default"
        className={cn(selectTriggerVariants, className)}
      >
        {allowAccountDefault ? (
          <option value={ACCOUNT_DEFAULT_MEDIA_DOMAIN}>Account default</option>
        ) : null}
        {mediaDomains.map((domain) => (
          <option key={domain.id} value={domain.id}>
            {domain.host}
          </option>
        ))}
      </select>
    );
  }

  return (
    <>
      <Select
        value={toItem(selected)}
        onValueChange={(item) => {
          const wire = toWire(item);
          if (value === undefined) setUncontrolled(wire);
          onValueChange?.(wire);
        }}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          className={className}
          aria-describedby={ariaDescribedBy}
        >
          <SelectValue placeholder="Account default" />
        </SelectTrigger>
        <SelectContent>
          {allowAccountDefault ? (
            <SelectItem value={ACCOUNT_DEFAULT_ITEM}>
              Account default
            </SelectItem>
          ) : null}
          {mediaDomains.map((domain) => (
            <SelectItem key={domain.id} value={domain.id}>
              {domain.host}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {name ? (
        <input type="hidden" name={name} value={selected} readOnly />
      ) : null}
    </>
  );
}
