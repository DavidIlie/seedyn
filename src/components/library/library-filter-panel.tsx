import { ChevronDown } from "lucide-react";

import { buttonVariants } from "~/components/ui/button";
import { cn } from "~/lib/utils";

/**
 * The narrowing filters, folded away until asked for.
 *
 * A native `<details>` rather than a Collapsible on purpose. This disclosure
 * holds form fields, and Radix unmounts closed content — the fields would leave
 * the form and stop submitting. `<details>` keeps them in the DOM, opens with
 * no JavaScript at all, and is already keyboard- and screen-reader-correct.
 *
 * It opens itself whenever a filter is applied, so a shared link never hides
 * the reason its results look narrow.
 */
export function LibraryFilterPanel({
  active,
  children,
}: {
  active: number;
  children: React.ReactNode;
}) {
  return (
    <details open={active > 0} className="group w-full">
      <summary
        className={cn(
          buttonVariants({ variant: "outline", size: "default" }),
          "w-full cursor-pointer list-none sm:w-auto [&::-webkit-details-marker]:hidden",
        )}
      >
        Filters
        {active > 0 ? (
          <span className="bg-accent text-accent-foreground grid size-5 place-items-center rounded-full text-[0.6875rem] leading-none font-semibold">
            {active}
          </span>
        ) : null}
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="border-border bg-panel mt-2 rounded-xl border p-4">
        {children}
      </div>
    </details>
  );
}
