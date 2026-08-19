import "server-only";

import { env, mediaDomainCatalog } from "~/env";
import { parseHostSet, resolveOriginRole } from "~/lib/origin";
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

const appHosts = parseHostSet(env.APP_HOSTS);
const mediaHosts = parseHostSet(env.MEDIA_HOSTS);

/**
 * Active uploaded documents may only use an origin that the host boundary
 * classifies exclusively as public media. An accidental app/media hostname
 * overlap resolves to the application role and therefore fails closed here.
 */
export function isIsolatedMediaOrigin(
  value: string | null | undefined,
): value is string {
  const domain = mediaDomainCatalog.domains.find(
    (candidate) => candidate.origin === value,
  );
  return (
    domain !== undefined &&
    resolveOriginRole(domain.host, appHosts, mediaHosts) === "media"
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
