import "server-only";

import { mediaDomainCatalog } from "~/env";
import {
  buildPublicMediaUrl,
  findMediaDomain,
  resolveMediaDomain,
} from "~/lib/media-domains.js";

export type MediaDomainChoice = {
  id: string;
  host: string;
  origin: string;
};

export function listMediaDomainChoices(): MediaDomainChoice[] {
  return mediaDomainCatalog.domains.map(({ id, host, origin }) => ({
    id,
    host,
    origin,
  }));
}

export function validMediaDomainId(value: string | null | undefined): boolean {
  return findMediaDomain(mediaDomainCatalog, value) !== null;
}

export function validMediaOrigin(
  value: string | null | undefined,
): value is string {
  return (
    typeof value === "string" &&
    mediaDomainCatalog.domains.some((domain) => domain.origin === value)
  );
}

/**
 * Resolve a preference chain without letting an unknown or retired id suppress
 * the next valid preference.
 */
export function resolveMediaDomainPreference(
  ...domainIds: (string | null | undefined)[]
): MediaDomainChoice {
  for (const domainId of domainIds) {
    const domain = findMediaDomain(mediaDomainCatalog, domainId);
    if (domain) return domain;
  }
  const fallback = resolveMediaDomain(mediaDomainCatalog, null);
  if (!fallback) throw new Error("No public media domain is configured.");
  return fallback;
}

export function mediaDomainForStoredOrigin(
  mediaOrigin: string | null | undefined,
): MediaDomainChoice {
  const stored = mediaOrigin
    ? mediaDomainCatalog.domains.find((domain) => domain.origin === mediaOrigin)
    : null;
  return stored ?? resolveMediaDomainPreference();
}

export function publicMediaUrl(input: {
  publicSlug: string;
  extension: string;
  mediaOrigin?: string | null;
}): string {
  const domain = mediaDomainForStoredOrigin(input.mediaOrigin);
  return buildPublicMediaUrl(mediaDomainCatalog, {
    domainId: domain.id,
    publicSlug: input.publicSlug,
    extension: input.extension,
  });
}
