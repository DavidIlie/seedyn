import { normalizeUploadSearchQuery } from "~/lib/upload-search";

/**
 * One filter vocabulary for the library, shared by three readers.
 *
 * The page (a Server Component) reads it from `searchParams`, the JSON listing
 * route reads it from a `URLSearchParams`, and the browser island reproduces it
 * as a query string. Parsing lives here so those three can never disagree about
 * what `min=2500000` means — a disagreement that shows up as a first page that
 * does not match the pages scrolled after it.
 *
 * Every field is validated, never trusted: these are user-editable URL values
 * that reach a database query. An unparseable value degrades to "not filtered"
 * rather than to an error, because a filter is a read-only view and a broken
 * link should still show the library.
 */

export type UploadOrder = "newest" | "oldest";

export const UPLOAD_ORIGIN_VALUES = [
  "BROWSER",
  "HTTP",
  "SHAREX",
  "S3",
  "LEGACY_UNKNOWN",
] as const;

export type UploadOriginFilter = (typeof UPLOAD_ORIGIN_VALUES)[number];

export const UPLOAD_ORIGIN_LABELS: Record<UploadOriginFilter, string> = {
  BROWSER: "This browser",
  HTTP: "HTTP API",
  SHAREX: "ShareX",
  S3: "S3 client",
  LEGACY_UNKNOWN: "Unrecorded",
};

/** The credential value meaning "uploaded without an API key at all". */
export const NO_CREDENTIAL = "none";

/** Any filter value meaning "do not narrow on this dimension". */
export const ANY_VALUE = "";

export type UploadFilters = {
  query: string;
  order: UploadOrder;
  /** `""` any · `NO_CREDENTIAL` browser uploads · otherwise an API key id. */
  credential: string;
  origin: "" | UploadOriginFilter;
  /** `""` or `YYYY-MM-DD`, inclusive, interpreted in UTC. */
  from: string;
  to: string;
  /** Inclusive byte bounds, or null. */
  minSize: number | null;
  maxSize: number | null;
};

export const EMPTY_UPLOAD_FILTERS: UploadFilters = {
  query: "",
  order: "newest",
  credential: ANY_VALUE,
  origin: ANY_VALUE,
  from: "",
  to: "",
  minSize: null,
  maxSize: null,
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Decimal units to match what the library prints (`formatBytes` counts in
 * thousands), with the binary spellings accepted for anyone who means them.
 */
const SIZE_UNITS: Record<string, number> = {
  b: 1,
  k: 1e3,
  kb: 1e3,
  m: 1e6,
  mb: 1e6,
  g: 1e9,
  gb: 1e9,
  t: 1e12,
  tb: 1e12,
  kib: 1024,
  mib: 1024 ** 2,
  gib: 1024 ** 3,
  tib: 1024 ** 4,
};

const SIZE_PATTERN = /^(\d+(?:[.,]\d+)?)\s*([a-z]*)$/i;

/**
 * `10mb`, `1.5 GiB`, `500 KB`, or a bare byte count. Returns null for anything
 * else, including a negative or non-finite amount.
 */
export function parseByteSize(input: string | undefined): number | null {
  const trimmed = input?.trim() ?? "";
  if (trimmed === "") return null;
  const match = SIZE_PATTERN.exec(trimmed);
  if (!match?.[1]) return null;
  const amount = Number(match[1].replace(",", "."));
  const unit = (match[2] ?? "").toLowerCase();
  const multiplier = unit === "" ? 1 : SIZE_UNITS[unit];
  if (multiplier === undefined || !Number.isFinite(amount) || amount < 0) {
    return null;
  }
  const bytes = Math.round(amount * multiplier);
  return Number.isSafeInteger(bytes) ? bytes : null;
}

function parseDate(input: string | undefined): string {
  const value = input?.trim() ?? "";
  if (!DATE_PATTERN.test(value)) return "";
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
    ? ""
    : value;
}

export type ParamReader = (key: string) => string | undefined;

/** Reads the first value of a Next.js `searchParams` entry. */
export function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

export function readerFromSearchParams(
  params: Record<string, string | string[] | undefined>,
): ParamReader {
  return (key) => firstParam(params[key]);
}

export function readerFromUrlSearchParams(
  params: URLSearchParams,
): ParamReader {
  return (key) => params.get(key) ?? undefined;
}

export function parseUploadFilters(read: ParamReader): UploadFilters {
  const credential = read("key")?.trim() ?? "";
  const origin = read("origin")?.trim().toUpperCase() ?? "";

  return {
    query: normalizeUploadSearchQuery(read("q")),
    order: read("order") === "oldest" ? "oldest" : "newest",
    credential: ID_PATTERN.test(credential) ? credential : ANY_VALUE,
    origin: (UPLOAD_ORIGIN_VALUES as readonly string[]).includes(origin)
      ? (origin as UploadOriginFilter)
      : ANY_VALUE,
    from: parseDate(read("from")),
    to: parseDate(read("to")),
    minSize: parseByteSize(read("min")),
    maxSize: parseByteSize(read("max")),
  };
}

/**
 * The canonical query string for a filter set. Defaults are omitted so the
 * unfiltered library keeps a bare URL and two equivalent filter sets produce
 * the same TanStack Query key.
 */
export function uploadFilterParams(filters: UploadFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.order === "oldest") params.set("order", filters.order);
  if (filters.credential) params.set("key", filters.credential);
  if (filters.origin) params.set("origin", filters.origin);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.minSize !== null) params.set("min", String(filters.minSize));
  if (filters.maxSize !== null) params.set("max", String(filters.maxSize));
  return params;
}

/** Ordering is a view preference, not a narrowing, so it does not count. */
export function countActiveUploadFilters(filters: UploadFilters): number {
  return (
    (filters.query ? 1 : 0) +
    (filters.credential ? 1 : 0) +
    (filters.origin ? 1 : 0) +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0) +
    (filters.minSize !== null ? 1 : 0) +
    (filters.maxSize !== null ? 1 : 0)
  );
}

export function hasActiveUploadFilters(filters: UploadFilters): boolean {
  return countActiveUploadFilters(filters) > 0;
}

/** Only the narrowing dimensions, for a stable cache key. */
export function uploadFilterKey(filters: UploadFilters): string {
  return uploadFilterParams(filters).toString();
}
