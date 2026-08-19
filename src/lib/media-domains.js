const DEFAULT_DOMAIN_ID = "default";
const MAX_MEDIA_DOMAINS = 16;
const DOMAIN_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/u;
const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

export const PUBLIC_MEDIA_SLUG_PATTERN_SOURCE =
  "[A-Za-z0-9](?:[A-Za-z0-9_-]{1,62}[A-Za-z0-9])?";

const PUBLIC_MEDIA_SLUG_PATTERN = new RegExp(
  `^${PUBLIC_MEDIA_SLUG_PATTERN_SOURCE}$`,
  "u",
);
const PUBLIC_MEDIA_EXTENSION_PATTERN = /^[a-z0-9]{1,10}$/u;

/**
 * @typedef {{ id: string; origin: string; host: string }} MediaDomain
 * @typedef {{
 *   domains: readonly MediaDomain[];
 *   defaultId: string;
 *   origins: readonly string[];
 *   hosts: readonly string[];
 *   explicit: boolean;
 * }} MediaDomainCatalog
 */

/** @param {string} hostname */
function isValidHostname(hostname) {
  return HOSTNAME_PATTERN.test(hostname) && !hostname.endsWith(".");
}

/**
 * @param {string} value
 * @param {{ allowHttp: boolean; allowLocalHttp: boolean }} options
 */
function normalizeMediaOrigin(value, options) {
  if (!value || value !== value.trim()) {
    throw new Error("Media domain origins cannot be empty or padded");
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid media domain origin: ${value}`);
  }

  const hostname = url.hostname.toLowerCase();
  const isLocalHostname =
    hostname === "localhost" || hostname.endsWith(".localhost");
  const protocolAllowed =
    url.protocol === "https:" ||
    (url.protocol === "http:" &&
      (options.allowHttp || (options.allowLocalHttp && isLocalHostname)));
  if (
    !protocolAllowed ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    !isValidHostname(hostname)
  ) {
    throw new Error(`Invalid media domain origin: ${value}`);
  }

  return { host: hostname, origin: url.origin };
}

/** @param {string} value */
function normalizeLegacyMediaHost(value) {
  if (
    !value ||
    value !== value.trim() ||
    value.includes(",") ||
    /[/\\@\s]/u.test(value) ||
    value.endsWith(".")
  ) {
    throw new Error(`Invalid media host: ${value}`);
  }

  let url;
  try {
    url = new URL(`https://${value}/`);
  } catch {
    throw new Error(`Invalid media host: ${value}`);
  }

  const hostname = url.hostname.toLowerCase();
  if (
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    !isValidHostname(hostname)
  ) {
    throw new Error(`Invalid media host: ${value}`);
  }

  return hostname;
}

/**
 * Parse the stable, operator-configured public media domain catalog.
 *
 * `CDN_URL` remains the compatibility default. When the explicit catalog does
 * not contain it, it is added with the reserved `default` id so existing links
 * and deployments keep working during migration.
 *
 * @param {{
 *   serialized?: string;
 *   fallbackOrigin: string;
 *   allowHttp?: boolean;
 *   allowLocalHttp?: boolean;
 *   maxEntries?: number;
 * }} options
 * @returns {MediaDomainCatalog}
 */
export function parseMediaDomainCatalog({
  serialized,
  fallbackOrigin,
  allowHttp = false,
  allowLocalHttp = false,
  maxEntries = MAX_MEDIA_DOMAINS,
}) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 64) {
    throw new Error("Media domain limit is invalid");
  }

  const explicit = Boolean(serialized?.trim());
  const entries = explicit ? (serialized ?? "").split(",") : [];
  /** @type {MediaDomain[]} */
  const domains = [];
  const byId = new Map();
  const byOrigin = new Map();
  const byHost = new Map();

  for (const rawEntry of entries) {
    const entry = rawEntry.trim();
    const separator = entry.indexOf("=");
    if (separator < 1 || separator === entry.length - 1) {
      throw new Error(`Invalid media domain entry: ${rawEntry}`);
    }

    const id = entry.slice(0, separator).trim();
    const rawOrigin = entry.slice(separator + 1).trim();
    if (!DOMAIN_ID_PATTERN.test(id)) {
      throw new Error(`Invalid media domain id: ${id}`);
    }

    const { host, origin } = normalizeMediaOrigin(rawOrigin, {
      allowHttp,
      allowLocalHttp,
    });
    const idMatch = byId.get(id);
    if (idMatch !== undefined) {
      if (idMatch === origin) continue;
      throw new Error(`Duplicate media domain id: ${id}`);
    }
    if (byOrigin.has(origin)) {
      throw new Error(`Duplicate media domain origin: ${origin}`);
    }
    if (byHost.has(host)) {
      throw new Error(`Duplicate media domain host: ${host}`);
    }

    domains.push(Object.freeze({ host, id, origin }));
    byId.set(id, origin);
    byOrigin.set(origin, id);
    byHost.set(host, id);
  }

  const fallback = normalizeMediaOrigin(fallbackOrigin, {
    allowHttp,
    allowLocalHttp,
  });
  let defaultId = byOrigin.get(fallback.origin);
  if (defaultId === undefined) {
    if (byId.has(DEFAULT_DOMAIN_ID)) {
      throw new Error(
        `The reserved media domain id '${DEFAULT_DOMAIN_ID}' must use CDN_URL`,
      );
    }
    if (byHost.has(fallback.host)) {
      throw new Error(`CDN_URL conflicts with media host: ${fallback.host}`);
    }
    domains.unshift(
      Object.freeze({
        host: fallback.host,
        id: DEFAULT_DOMAIN_ID,
        origin: fallback.origin,
      }),
    );
    defaultId = DEFAULT_DOMAIN_ID;
  }

  if (domains.length > maxEntries) {
    throw new Error(`Configure at most ${maxEntries} media domains`);
  }

  return Object.freeze({
    defaultId,
    domains: Object.freeze(domains),
    explicit,
    hosts: Object.freeze(domains.map((domain) => domain.host)),
    origins: Object.freeze(domains.map((domain) => domain.origin)),
  });
}

/**
 * Derive the request host allowlist from the catalog. The old `MEDIA_HOSTS`
 * value may add aliases only while `MEDIA_DOMAINS` is absent; once the catalog
 * is explicit, legacy hosts are validation-only and cannot widen the boundary.
 *
 * @param {MediaDomainCatalog} catalog
 * @param {string | undefined} serializedLegacyHosts
 * @returns {readonly string[]}
 */
export function resolveMediaHostAllowlist(catalog, serializedLegacyHosts) {
  const legacyHosts = (
    serializedLegacyHosts?.trim() ? serializedLegacyHosts.split(",") : []
  ).map((host) => normalizeLegacyMediaHost(host.trim()));
  const catalogHosts = new Set(catalog.hosts);

  if (catalog.explicit) {
    const unknown = legacyHosts.find((host) => !catalogHosts.has(host));
    if (unknown) {
      throw new Error(
        `MEDIA_HOSTS contains '${unknown}', which is not in MEDIA_DOMAINS`,
      );
    }
    return catalog.hosts;
  }

  const hosts = [...catalog.hosts];
  for (const host of legacyHosts) {
    if (!catalogHosts.has(host)) {
      catalogHosts.add(host);
      hosts.push(host);
    }
  }
  if (hosts.length > MAX_MEDIA_DOMAINS) {
    throw new Error(`Configure at most ${MAX_MEDIA_DOMAINS} media hosts`);
  }
  return Object.freeze(hosts);
}

/** @param {MediaDomainCatalog} catalog @param {string | null | undefined} id */
export function findMediaDomain(catalog, id) {
  if (!id) return null;
  return catalog.domains.find((domain) => domain.id === id) ?? null;
}

/** @param {MediaDomainCatalog} catalog @param {string | null | undefined} id */
export function resolveMediaDomain(catalog, id) {
  return (
    findMediaDomain(catalog, id) ??
    findMediaDomain(catalog, catalog.defaultId) ??
    catalog.domains[0]
  );
}

/** @param {string} value */
export function isPublicMediaSlug(value) {
  return PUBLIC_MEDIA_SLUG_PATTERN.test(value);
}

/** @param {string} value */
export function isPublicMediaExtension(value) {
  return PUBLIC_MEDIA_EXTENSION_PATTERN.test(value);
}

/**
 * @param {MediaDomainCatalog} catalog
 * @param {{
 *   domainId?: string | null;
 *   publicSlug: string;
 *   extension: string;
 * }} asset
 */
export function buildPublicMediaUrl(catalog, asset) {
  if (
    !isPublicMediaSlug(asset.publicSlug) ||
    !isPublicMediaExtension(asset.extension)
  ) {
    throw new Error("Invalid public media asset");
  }

  const domain = resolveMediaDomain(catalog, asset.domainId);
  if (!domain) throw new Error("Media domain catalog is empty");
  return `${domain.origin}/${asset.publicSlug}.${asset.extension}`;
}
