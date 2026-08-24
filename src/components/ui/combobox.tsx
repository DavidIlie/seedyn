"use client";

import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useId, useState } from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { selectTriggerVariants } from "~/components/ui/select";
import { cn } from "~/lib/utils";

export type ComboboxOption = { value: string; label: string };

/**
 * A listbox with a filter box, for lists nobody should have to scan.
 *
 * The rule this app applies: a control gets search when its options are
 * unbounded — API keys, media domains, anything the reader created — or when a
 * fixed list is long enough that typing beats scanning. Below that, a plain
 * `Select` is faster: no filter box to dismiss, and the whole list is visible
 * at once.
 *
 * It wears `selectTriggerVariants`, so a searchable control and a plain one are
 * the same object on the page until it is opened.
 */
export function Combobox({
  id,
  label,
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyLabel = "No match.",
  className,
  disabled,
}: {
  id?: string;
  /** Announced by the trigger; render a visible `<Label>` instead when there is room. */
  label: string;
  options: readonly ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // The combobox pattern points the trigger at the list it opens. The list only
  // exists while the popover is mounted, so the id is minted here and attached
  // on both ends.
  const listId = useId();
  const selected = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        data-size="default"
        className={cn(selectTriggerVariants, className)}
      >
        <span
          data-slot="select-value"
          className={cn(!selected && "text-muted-foreground")}
        >
          {selected?.label ?? placeholder}
        </span>
        <ChevronDownIcon aria-hidden="true" className="size-4 opacity-50" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) p-0"
      >
        <Command
          // Values collide across lists — two API keys can share a name, and
          // the sentinel values are not human words. Filter on the label the
          // reader can actually see, and key on the value.
          filter={(itemValue, search) => {
            const option = options.find((entry) => entry.value === itemValue);
            const haystack =
              `${option?.label ?? ""} ${itemValue}`.toLowerCase();
            return haystack.includes(search.trim().toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList id={listId}>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={(next) => {
                    onValueChange(next);
                    setOpen(false);
                  }}
                >
                  <CheckIcon
                    aria-hidden="true"
                    className={cn(
                      "size-4",
                      option.value === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Where a fixed list stops being scannable and starts needing a filter box.
 * Unbounded lists do not consult this — they pass `searchable` explicitly.
 */
export const SEARCHABLE_OPTION_THRESHOLD = 8;
