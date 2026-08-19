import type { Route } from "next";

export const ADMIN_RANGE_DAYS = [7, 30, 90] as const;
export const ADMIN_UPLOAD_KINDS = ["IMAGE", "VIDEO", "FILE", "TEXT"] as const;
export const ADMIN_USER_PAGE_SIZE = 25;
export const ADMIN_USER_SORTS = [
  "account",
  "uploads",
  "stored",
  "keys",
  "last",
  "joined",
] as const;

export type AdminRangeDays = (typeof ADMIN_RANGE_DAYS)[number];
export type AdminUploadKind = (typeof ADMIN_UPLOAD_KINDS)[number];
export type AdminUserSort = (typeof ADMIN_USER_SORTS)[number];
export type AdminSortDirection = "asc" | "desc";

export type AdminUserView = {
  page: number;
  query: string;
  sort: AdminUserSort;
  direction: AdminSortDirection;
};

export type AdminViewPatch = Partial<AdminUserView> & {
  rangeDays?: AdminRangeDays;
};

export type DailyUploadAggregate = {
  day: Date;
  kind: AdminUploadKind;
  count: bigint;
  byteSize: bigint;
};

export type DailyUploadPoint = {
  date: string;
  label: string;
  IMAGE: number;
  VIDEO: number;
  FILE: number;
  TEXT: number;
  total: number;
  byteSize: string;
};

export function parseAdminRange(value: unknown): AdminRangeDays {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === "7") return 7;
  if (candidate === "90") return 90;
  return 30;
}

function scalar(value: unknown): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" ? candidate : undefined;
}

export function parseAdminUserView(
  params: Record<string, string | string[] | undefined>,
): AdminUserView {
  const requestedPage = Number.parseInt(scalar(params.page) ?? "1", 10);
  const requestedSort = scalar(params.sort);
  const sort: AdminUserSort = ADMIN_USER_SORTS.some(
    (candidate) => candidate === requestedSort,
  )
    ? (requestedSort as AdminUserSort)
    : "joined";
  const requestedDirection = scalar(params.direction);

  return {
    page:
      Number.isSafeInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1,
    query: (scalar(params.q) ?? "").normalize("NFC").trim().slice(0, 100),
    sort,
    direction:
      requestedDirection === "asc" || requestedDirection === "desc"
        ? requestedDirection
        : sort === "account"
          ? "asc"
          : "desc",
  };
}

export function buildAdminHref(
  rangeDays: AdminRangeDays,
  view: AdminUserView,
  patch: AdminViewPatch,
): Route {
  const nextRange = patch.rangeDays ?? rangeDays;
  const next = { ...view, ...patch };
  const params = new URLSearchParams();
  if (nextRange !== 30) params.set("range", String(nextRange));
  if (next.query) params.set("q", next.query);
  if (next.sort !== "joined") params.set("sort", next.sort);
  const defaultDirection = next.sort === "account" ? "asc" : "desc";
  if (next.direction !== defaultDirection) {
    params.set("direction", next.direction);
  }
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `/admin?${query}` : "/admin";
}

export function adminRangeStart(now: Date, days: AdminRangeDays): Date {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - days + 1,
    ),
  );
}

function safeCount(value: bigint): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Admin aggregate count exceeds the safe numeric range");
  }
  return count;
}

export function buildDailyUploadSeries(input: {
  now: Date;
  days: AdminRangeDays;
  rows: DailyUploadAggregate[];
}): DailyUploadPoint[] {
  const start = adminRangeStart(input.now, input.days);
  const points = new Map<string, DailyUploadPoint>();
  const labels = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  for (let index = 0; index < input.days; index += 1) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    const date = day.toISOString().slice(0, 10);
    points.set(date, {
      date,
      label: labels.format(day),
      IMAGE: 0,
      VIDEO: 0,
      FILE: 0,
      TEXT: 0,
      total: 0,
      byteSize: "0",
    });
  }

  for (const row of input.rows) {
    const date = row.day.toISOString().slice(0, 10);
    const point = points.get(date);
    if (!point) continue;
    const count = safeCount(row.count);
    point[row.kind] += count;
    point.total += count;
    point.byteSize = (BigInt(point.byteSize) + row.byteSize).toString(10);
  }

  return [...points.values()];
}
