import Form from "next/form";

import { formatBytes } from "~/components/lib/format";
import { Badge } from "~/components/ui/badge";
import { Button, buttonVariants } from "~/components/ui/button";
import { FormSelect } from "~/components/ui/form-select";
import { Input, inputVariants } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { CredentialChoice } from "~/components/data/uploads";
import {
  countActiveUploadFilters,
  NO_CREDENTIAL,
  UPLOAD_ORIGIN_LABELS,
  UPLOAD_ORIGIN_VALUES,
  type UploadFilters,
} from "~/lib/upload-filters";
import { cn } from "~/lib/utils";

import { LibraryFilterPanel } from "./library-filter-panel";

export type LibraryPath = "/images" | "/files" | "/texts";

const ORDER_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
] as const;

export function credentialOptions(choices: readonly CredentialChoice[]) {
  return [
    { value: "", label: "Any source" },
    { value: NO_CREDENTIAL, label: "Uploaded in the browser" },
    ...choices.map((choice) => ({
      value: choice.id,
      label: choice.revoked ? `${choice.name} (revoked)` : choice.name,
    })),
  ];
}

export function originOptions() {
  return [
    { value: "", label: "Any method" },
    ...UPLOAD_ORIGIN_VALUES.map((value) => ({
      value,
      label: UPLOAD_ORIGIN_LABELS[value],
    })),
  ];
}

/**
 * Search, ordering, and the narrowing filters as URL state.
 *
 * `next/form` submits with a client navigation and still works as a plain GET
 * form before hydration, so the filter is a real, shareable, back-button-safe
 * URL rather than component state. No client store mirrors it.
 *
 * Filtering is done by the database, not by the table: the library is an
 * infinite keyset-paginated list, so a client-side predicate would only narrow
 * the rows already fetched and would silently disagree with the next page. The
 * URL is the single source of truth that the Server Component, the JSON route,
 * and the TanStack Query key all read.
 *
 * The selects need JavaScript for their listbox; each posts its applied value
 * through a hidden field present in the server-rendered HTML, so an unhydrated
 * submission still carries it.
 */
export function LibraryControls({
  action,
  filters,
  credentials,
}: {
  action: LibraryPath;
  filters: UploadFilters;
  credentials: readonly CredentialChoice[];
}) {
  const active = countActiveUploadFilters(filters);

  return (
    <Form
      action={action}
      // No cursor field: submitting a new filter set always restarts at the
      // first page, because a cursor from the old set points into a list that
      // no longer exists.
      className="flex flex-col gap-2 pb-4"
    >
      <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
        <label htmlFor="library-query" className="sr-only">
          Search filenames
        </label>
        <Input
          // Keyed on the committed URL value so back navigation shows the
          // filter that is actually applied.
          key={filters.query}
          id="library-query"
          name="q"
          type="search"
          inputMode="search"
          defaultValue={filters.query}
          placeholder="Search filenames…"
          className="sm:max-w-xs"
        />
        <FormSelect
          key={filters.order}
          id="library-order"
          name="order"
          label="Order"
          options={ORDER_OPTIONS}
          defaultValue={filters.order}
          className="w-full sm:w-44"
        />
        <Button type="submit" variant="outline" className="w-full sm:w-auto">
          Apply
        </Button>
      </div>

      <LibraryFilterPanel active={active}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="library-key">Uploaded with</Label>
            <FormSelect
              key={filters.credential}
              id="library-key"
              name="key"
              label="Uploaded with"
              options={credentialOptions(credentials)}
              defaultValue={filters.credential}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="library-origin">Method</Label>
            <FormSelect
              key={filters.origin}
              id="library-origin"
              name="origin"
              label="Method"
              options={originOptions()}
              defaultValue={filters.origin}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="library-from">Uploaded after</Label>
            <Input
              key={filters.from}
              id="library-from"
              name="from"
              type="date"
              defaultValue={filters.from}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="library-to">Uploaded before</Label>
            <Input
              key={filters.to}
              id="library-to"
              name="to"
              type="date"
              defaultValue={filters.to}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="library-min">Larger than</Label>
            <Input
              key={filters.minSize}
              id="library-min"
              name="min"
              inputMode="text"
              placeholder="e.g. 500 KB"
              defaultValue={
                filters.minSize === null ? "" : formatBytes(filters.minSize)
              }
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="library-max">Smaller than</Label>
            <Input
              key={filters.maxSize}
              id="library-max"
              name="max"
              inputMode="text"
              placeholder="e.g. 25 MB"
              defaultValue={
                filters.maxSize === null ? "" : formatBytes(filters.maxSize)
              }
            />
          </div>

          <p className="text-muted-foreground self-end text-xs sm:col-span-2">
            Sizes accept units — <code>10mb</code>, <code>1.5gb</code>,{" "}
            <code>500kb</code> — or a plain byte count. Dates are inclusive.
          </p>
        </div>
      </LibraryFilterPanel>

      {active > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-xs">Filtering by</span>
          {describeFilters(filters, credentials).map((chip) => (
            <Badge key={chip}>{chip}</Badge>
          ))}
          <a
            href={action}
            className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
          >
            Clear all
          </a>
        </div>
      ) : null}
    </Form>
  );
}

/** The applied filters in words, so a narrowed library never looks empty by accident. */
function describeFilters(
  filters: UploadFilters,
  credentials: readonly CredentialChoice[],
): string[] {
  const chips: string[] = [];
  if (filters.query) chips.push(`name contains “${filters.query}”`);
  if (filters.credential === NO_CREDENTIAL) {
    chips.push("uploaded in the browser");
  } else if (filters.credential) {
    const match = credentials.find(
      (choice) => choice.id === filters.credential,
    );
    chips.push(`key: ${match?.name ?? "deleted key"}`);
  }
  if (filters.origin) chips.push(UPLOAD_ORIGIN_LABELS[filters.origin]);
  if (filters.from) chips.push(`after ${filters.from}`);
  if (filters.to) chips.push(`before ${filters.to}`);
  if (filters.minSize !== null) {
    chips.push(`larger than ${formatBytes(filters.minSize)}`);
  }
  if (filters.maxSize !== null) {
    chips.push(`smaller than ${formatBytes(filters.maxSize)}`);
  }
  return chips;
}

/**
 * The controls at their exact resolved size while the URL values stream in.
 * The route shell is supposed to contain the search, order, and filter
 * controls; only their current values depend on request data.
 *
 * The filter panel renders closed here. A URL that already carries a filter
 * opens it once its values arrive, which is the one case where this shell is
 * shorter than what replaces it.
 */
export function LibraryControlsSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2 pb-4">
      <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
        <div className={cn(inputVariants, "sm:max-w-xs")} />
        <div className={cn(inputVariants, "w-full sm:w-44")} />
        <div
          className={cn(
            buttonVariants({ variant: "outline" }),
            "w-full sm:w-20",
          )}
        />
      </div>
      <div
        className={cn(
          buttonVariants({ variant: "outline" }),
          "w-full sm:w-[6.5rem]",
        )}
      />
    </div>
  );
}
