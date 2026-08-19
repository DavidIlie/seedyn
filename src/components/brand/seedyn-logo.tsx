import { GuardedLink } from "~/components/navigation/navigation-blocker";

/**
 * The Seedyn port mark: one stored object enters a private ring and leaves as
 * two addressable link nodes. Every primitive is solid and the detached nodes
 * keep more than one device pixel of separation at 16px.
 */
export function SeedynMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M20.75 4.4A12.25 12.25 0 1 0 20.75 27.6"
        stroke="currentColor"
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <rect
        x="10.75"
        y="10.75"
        width="10.5"
        height="10.5"
        rx="2.75"
        fill="currentColor"
      />
      <circle cx="27" cy="9.25" r="3" fill="currentColor" />
      <circle cx="27" cy="22.75" r="3" fill="currentColor" />
    </svg>
  );
}

export function SeedynLogo({
  href = "/dashboard",
  className = "",
}: {
  href?: "/dashboard" | "/docs";
  className?: string;
}) {
  return (
    <GuardedLink
      href={href}
      aria-label="Seedyn library"
      className={`group inline-flex items-center gap-2 ${className}`}
    >
      <SeedynMark className="text-accent size-7 shrink-0 transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] group-active:scale-[0.96] motion-reduce:transform-none" />
      <span className="font-display hidden text-[15px] font-semibold tracking-[-0.025em] min-[480px]:inline lg:inline">
        Seedyn
      </span>
    </GuardedLink>
  );
}
