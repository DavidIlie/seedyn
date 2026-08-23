import Form from "next/form";

import { Button, buttonVariants } from "~/components/ui/button";
import { FormSelect } from "~/components/ui/form-select";
import { Input, inputVariants } from "~/components/ui/input";
import { cn } from "~/lib/utils";

export type LibraryPath = "/images" | "/files" | "/texts";

const ORDER_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
] as const;

/**
 * Search and ordering as URL state.
 *
 * `next/form` submits with a client navigation and still works as a plain GET
 * form before hydration, so the filter is a real, shareable, back-button-safe
 * URL rather than component state. No client store mirrors it.
 *
 * Only the order control needs JavaScript for its listbox; it posts the
 * currently applied order through a hidden field that is present in the
 * server-rendered HTML, so an unhydrated submission still carries it.
 */
export function LibraryControls({
  action,
  query,
  order,
}: {
  action: LibraryPath;
  query: string;
  order: "newest" | "oldest";
}) {
  return (
    <Form
      action={action}
      className="grid grid-cols-1 gap-2 pb-4 sm:flex sm:items-center"
    >
      <label htmlFor="library-query" className="sr-only">
        Search filenames
      </label>
      <Input
        // Keyed on the committed URL value so back navigation shows the filter
        // that is actually applied.
        key={query}
        id="library-query"
        name="q"
        type="search"
        inputMode="search"
        defaultValue={query}
        placeholder="Search filenames…"
        className="sm:max-w-xs"
      />
      <FormSelect
        key={order}
        id="library-order"
        name="order"
        label="Order"
        options={ORDER_OPTIONS}
        defaultValue={order}
        className="w-full sm:w-44"
      />
      <Button type="submit" variant="outline" className="w-full sm:w-auto">
        Apply
      </Button>
    </Form>
  );
}

/**
 * The controls at their exact resolved size while the URL values stream in.
 * The route shell is supposed to contain the search and order controls, and
 * only their current values depend on request data.
 */
export function LibraryControlsSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-1 gap-2 pb-4 sm:flex sm:items-center"
    >
      <div className={cn(inputVariants, "sm:max-w-xs")} />
      <div className={cn(inputVariants, "w-full sm:w-44")} />
      <div
        className={cn(buttonVariants({ variant: "outline" }), "w-full sm:w-20")}
      />
    </div>
  );
}
