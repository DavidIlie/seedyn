import { isIP } from "node:net";

export type OriginRole = "app" | "media" | "unknown";

// This is a request provenance marker, not a credential. Proxy sets it only
// after validating its process-random rewrite token; direct internal paths are
// rejected before Route Handler dispatch.
export const VERIFIED_MEDIA_REWRITE_HEADER = "x-seedyn-verified-media-rewrite";

const MEDIA_PATH = /^\/([A-Za-z0-9_-]{22,64})\.([a-z0-9]{1,10})$/;

function validPort(value: string | undefined): boolean {
  return (
    value === undefined || (/^\d{1,5}$/u.test(value) && Number(value) <= 65_535)
  );
}

export function normalizeAuthority(value: string | null): string | null {
  if (!value || value !== value.trim() || value.includes(",")) return null;
  if (/[/\\@\s]/u.test(value) || value.endsWith(".")) return null;

  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    if (end < 0) return null;
    const hostname = value.slice(1, end).toLowerCase();
    if (!hostname || isIP(hostname) !== 6) return null;
    const suffix = value.slice(end + 1);
    if (suffix && (!suffix.startsWith(":") || !validPort(suffix.slice(1)))) {
      return null;
    }
    // Canonicalize equivalent IPv6 spellings so config and request authorities
    // cannot disagree about an otherwise valid literal.
    return new URL(`http://[${hostname}]/`).hostname.slice(1, -1);
  }

  const colonCount = value.match(/:/g)?.length ?? 0;
  if (colonCount > 1) return null;
  const [hostname, port] = value.split(":");
  if (!hostname || !validPort(port)) return null;
  if (!/^[a-z0-9.-]+$/iu.test(hostname)) return null;
  return hostname.toLowerCase();
}

export function parseHostSet(value: string): ReadonlySet<string> {
  return new Set(
    value
      .split(",")
      .map((host) => normalizeAuthority(host.trim()))
      .filter((host): host is string => host !== null),
  );
}

export function resolveOriginRole(
  authority: string | null,
  appHosts: ReadonlySet<string>,
  mediaHosts: ReadonlySet<string>,
): OriginRole {
  const host = normalizeAuthority(authority);
  if (!host) return "unknown";
  if (appHosts.has(host)) return "app";
  if (mediaHosts.has(host)) return "media";
  return "unknown";
}

export function parsePublicMediaPath(
  pathname: string,
): { slug: string; extension: string } | null {
  const match = MEDIA_PATH.exec(pathname);
  if (!match?.[1] || !match[2]) return null;
  return { slug: match[1], extension: match[2] };
}
