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
  {
    href: "/dashboard",
    segment: "dashboard",
    label: "Library",
    icon: "library",
  },
  { href: "/images", segment: "images", label: "Images", icon: "image" },
  { href: "/files", segment: "files", label: "Files", icon: "file" },
  { href: "/texts", segment: "texts", label: "Texts", icon: "text" },
  { href: "/api-keys", segment: "api-keys", label: "API keys", icon: "key" },
  { href: "/docs", segment: "docs", label: "Docs", icon: "docs" },
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
      <nav aria-label="Primary" className="hidden lg:block">
        <ul className="flex items-center gap-0.5">
          {NAV_DESTINATIONS.map((destination) => {
            const active = destination.segment === segment;
            return (
              <li key={destination.href}>
                <Link
                  href={destination.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    "flex h-10 items-center gap-2 rounded-lg px-2.5 text-sm transition-colors " +
                    (active
                      ? "bg-accent/10 text-accent font-medium"
                      : "text-muted-foreground hover:bg-sunken hover:text-foreground")
                  }
                >
                  <NavGlyph name={destination.icon} />
                  {destination.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <details ref={disclosureRef} className="relative lg:hidden">
        <summary className="border-border bg-panel flex h-11 cursor-pointer list-none items-center gap-2 rounded-lg border px-3 text-sm [&::-webkit-details-marker]:hidden">
          <NavGlyph name="library" />
          Browse
        </summary>
        <nav
          aria-label="Primary"
          className="border-border bg-panel absolute top-full right-0 z-50 mt-2 w-64 rounded-xl border p-1.5"
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
                      "flex h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors " +
                      (active
                        ? "bg-accent/10 text-accent font-medium"
                        : "text-muted-foreground hover:bg-sunken hover:text-foreground")
                    }
                  >
                    <NavGlyph name={destination.icon} />
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

function NavGlyph({
  name,
}: {
  name: (typeof NAV_DESTINATIONS)[number]["icon"];
}) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: "shrink-0",
  };

  if (name === "library") {
    return (
      <svg {...common}>
        <rect x="2" y="2" width="5" height="5" rx="1" />
        <rect x="9" y="2" width="5" height="5" rx="1" />
        <rect x="2" y="9" width="5" height="5" rx="1" />
        <rect x="9" y="9" width="5" height="5" rx="1" />
      </svg>
    );
  }
  if (name === "image") {
    return (
      <svg {...common}>
        <rect x="1.75" y="2.25" width="12.5" height="11.5" rx="2" />
        <circle cx="5.25" cy="5.75" r="1.25" />
        <path d="m3.25 11 2.5-2.5 1.75 1.75L10 7.75 12.75 11" />
      </svg>
    );
  }
  if (name === "file") {
    return (
      <svg {...common}>
        <path d="M4 1.75h5l3 3V14H4z" />
        <path d="M9 1.75V5h3" />
      </svg>
    );
  }
  if (name === "text") {
    return (
      <svg {...common}>
        <path d="M2.25 3.5h11.5M2.25 7.75h8.5M2.25 12h6" />
      </svg>
    );
  }
  if (name === "key") {
    return (
      <svg {...common}>
        <circle cx="5.25" cy="7" r="3" />
        <path d="m7.75 8.75 5 5M10.25 11.25l1.5-1.5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M2.25 2.5h4.25c1 0 1.5.5 1.5 1.5v9.5c0-1-.5-1.5-1.5-1.5H2.25zM13.75 2.5H9.5C8.5 2.5 8 3 8 4v9.5c0-1 .5-1.5 1.5-1.5h4.25z" />
    </svg>
  );
}
