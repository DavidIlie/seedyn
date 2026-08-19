import Form from "next/form";

import { buttonQuiet, inputBase } from "~/components/ui/styles";

export type LibraryPath = "/images" | "/files" | "/texts";

/**
 * Search and ordering as URL state.
 *
 * `next/form` submits with a client navigation and still works as a plain GET
 * form before hydration, so the filter is a real, shareable, back-button-safe
 * URL rather than component state. No client store mirrors it.
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
      <input
        // Keyed on the committed URL value so back navigation shows the filter
        // that is actually applied.
        key={query}
        id="library-query"
        name="q"
        type="search"
        inputMode="search"
        defaultValue={query}
        placeholder="Search filenames…"
        className={`${inputBase} sm:max-w-xs`}
      />
      <label htmlFor="library-order" className="sr-only">
        Order
      </label>
      <select
        key={order}
        id="library-order"
        name="order"
        defaultValue={order}
        className={`${inputBase} !w-full sm:!w-auto`}
      >
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
      </select>
      <button type="submit" className={`${buttonQuiet} w-full sm:w-auto`}>
        Apply
      </button>
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
      <div className={`${inputBase} sm:max-w-xs`} />
      <div className={`${inputBase} !w-full sm:!w-32`} />
      <div className={`${buttonQuiet} w-full sm:w-20`} />
    </div>
  );
}
