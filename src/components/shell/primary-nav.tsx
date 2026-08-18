import Link from "next/link";

/**
 * The six product destinations, rendered in both their wide and narrow forms.
 *
 * This component has no directive on purpose. It renders on the server as the
 * navigation's Suspense fallback — the full set of links, at their exact
 * geometry, with nothing marked current — and it renders again inside
 * `CurrentRouteNav` once the browser can say which destination is active. One
 * markup definition, two contexts, no drift between the fallback and the
 * resolved UI.
 *
 * Wide and narrow differ only by media query. Nothing here measures the
 * viewport, and the narrow disclosure is a native `<details>` that opens
 * without JavaScript.
 */

export const NAV_DESTINATIONS = [
  { href: "/dashboard", segment: "dashboard", label: "Recent" },
  { href: "/images", segment: "images", label: "Images" },
  { href: "/files", segment: "files", label: "Files" },
  { href: "/texts", segment: "texts", label: "Texts" },
  { href: "/api-keys", segment: "api-keys", label: "API keys" },
  { href: "/docs", segment: "docs", label: "Docs" },
] as const;

export function PrimaryNav({
  segment,
  signOut,
  disclosureRef,
}: {
  /** `null` before the current route is known, and on routes with no entry. */
  segment: string | null;
  signOut: React.ReactNode;
  disclosureRef?: React.Ref<HTMLDetailsElement>;
}) {
  return (
    <>
      <nav aria-label="Primary" className="hidden md:block">
        <ul className="flex items-center">
          {NAV_DESTINATIONS.map((destination) => {
            const active = destination.segment === segment;
            return (
              <li key={destination.href}>
                <Link
                  href={destination.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    "relative flex h-14 items-center px-3 text-sm transition-colors " +
                    (active
                      ? "text-foreground after:bg-accent after:absolute after:inset-x-3 after:-bottom-px after:h-0.5"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {destination.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <details ref={disclosureRef} className="relative md:hidden">
        <summary
          aria-label="Menu"
          className="border-border flex h-11 cursor-pointer list-none items-center rounded-sm border px-3 text-sm md:h-9 [&::-webkit-details-marker]:hidden"
        >
          Menu
        </summary>
        <nav
          aria-label="Primary"
          className="border-border bg-panel absolute top-full right-0 z-50 mt-2 w-56 rounded-sm border py-1"
        >
          <ul>
            {NAV_DESTINATIONS.map((destination) => {
              const active = destination.segment === segment;
              return (
                <li key={destination.href}>
                  <Link
                    href={destination.href}
                    aria-current={active ? "page" : undefined}
                    className={
                      "flex h-11 items-center px-3 text-sm " +
                      (active
                        ? "border-accent text-foreground border-l-2 pl-[10px]"
                        : "text-muted-foreground")
                    }
                  >
                    {destination.label}
                  </Link>
                </li>
              );
            })}
            <li className="border-border mt-1 border-t pt-1">{signOut}</li>
          </ul>
        </nav>
      </details>
    </>
  );
}
