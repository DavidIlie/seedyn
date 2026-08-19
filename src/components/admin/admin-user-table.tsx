import type { Route } from "next";
import Form from "next/form";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Search,
  UsersRound,
  X,
} from "lucide-react";

import { formatBytes, formatTimestamp } from "~/components/lib/format";
import type { AdminUserPage, AdminUserRow } from "~/server/admin/insights";
import {
  buildAdminHref,
  type AdminRangeDays,
  type AdminSortDirection,
  type AdminUserSort,
  type AdminUserView,
} from "~/server/admin/insights-view";

import { StorageQuotaControl } from "./storage-quota-control";
import { ClearUserUploads } from "./clear-user-uploads";

type UserTableProps = {
  users: AdminUserPage;
  rangeDays: AdminRangeDays;
};

export function AdminUserTable({ users, rangeDays }: UserTableProps) {
  const { items, page, pageSize, totalCount, totalPages, view } = users;
  const firstResult = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastResult = Math.min(page * pageSize, totalCount);
  const filtered = view.query.length > 0;

  return (
    <section
      aria-labelledby="users-heading"
      className="border-border bg-panel overflow-hidden rounded-xl border"
    >
      <div className="border-border flex flex-col gap-4 border-b px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="bg-brand text-brand-foreground grid size-9 shrink-0 place-items-center rounded-lg">
            <UsersRound aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h2
              id="users-heading"
              className="font-display text-base font-semibold"
            >
              People
            </h2>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Search accounts, inspect usage, and change member storage limits.
            </p>
          </div>
        </div>
        <p
          role="status"
          aria-live="polite"
          className="text-muted-foreground shrink-0 text-sm tabular-nums"
        >
          {filtered
            ? `${totalCount.toLocaleString("en-US")} matching`
            : `${totalCount.toLocaleString("en-US")} total`}
        </p>
      </div>

      <div className="border-border bg-sunken/45 flex flex-col gap-3 border-b p-3 sm:px-4 md:flex-row md:items-center md:justify-between">
        <Form
          action="/admin"
          scroll={false}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <input type="hidden" name="range" value={rangeDays} />
          <input type="hidden" name="sort" value={view.sort} />
          <input type="hidden" name="direction" value={view.direction} />
          <label className="relative min-w-0 flex-1 sm:max-w-sm">
            <span className="sr-only">Search people</span>
            <Search
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <input
              name="q"
              type="search"
              defaultValue={view.query}
              placeholder="Search name or email"
              autoComplete="off"
              className="border-border bg-panel placeholder:text-muted-foreground/80 hover:border-border-strong focus:border-accent h-11 w-full rounded-lg border pr-3 pl-9 text-sm transition-colors outline-none"
            />
          </label>
          <button
            type="submit"
            className="bg-brand text-brand-foreground hover:bg-accent inline-flex h-11 shrink-0 items-center rounded-lg px-3 text-sm font-semibold transition-colors"
          >
            Search
          </button>
          {view.query ? (
            <Link
              href={buildAdminHref(rangeDays, view, { query: "", page: 1 })}
              scroll={false}
              aria-label="Clear people search"
              className="border-border bg-panel text-muted-foreground hover:border-border-strong hover:text-foreground grid size-11 shrink-0 place-items-center rounded-lg border transition-colors"
            >
              <X aria-hidden="true" className="size-4" />
            </Link>
          ) : null}
        </Form>

        <Form
          action="/admin"
          scroll={false}
          className="flex items-center gap-2 md:hidden"
        >
          <input type="hidden" name="range" value={rangeDays} />
          <input type="hidden" name="q" value={view.query} />
          <label className="sr-only" htmlFor="mobile-user-sort">
            Sort people by
          </label>
          <select
            id="mobile-user-sort"
            name="sort"
            defaultValue={view.sort}
            className="border-border bg-panel h-11 min-w-0 flex-1 rounded-lg border px-2.5 text-sm"
          >
            <option value="joined">Joined</option>
            <option value="last">Last upload</option>
            <option value="account">Account</option>
            <option value="uploads">Uploads</option>
            <option value="stored">Stored</option>
            <option value="keys">Keys</option>
          </select>
          <label className="sr-only" htmlFor="mobile-user-direction">
            Sort direction
          </label>
          <select
            id="mobile-user-direction"
            name="direction"
            defaultValue={view.direction}
            className="border-border bg-panel h-11 rounded-lg border px-2.5 text-sm"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
          <button
            type="submit"
            className="border-border bg-panel hover:border-border-strong hover:bg-sunken h-11 rounded-lg border px-3 text-sm font-semibold transition-colors"
          >
            Sort
          </button>
        </Form>
      </div>

      {items.length === 0 ? (
        <div className="grid min-h-52 place-items-center px-6 py-10 text-center">
          <div>
            <p className="font-display text-sm font-semibold">
              No people match this view
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              Clear the search and try a different name or email.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[68rem] table-auto text-left text-sm">
              <caption className="sr-only">
                {`People ${filtered ? `matching ${view.query}, ` : ""}sorted by ${view.sort} ${view.direction}, page ${page} of ${totalPages}.`}
              </caption>
              <thead className="bg-sunken/55 text-muted-foreground text-xs">
                <tr className="border-border border-b">
                  <SortableHeader
                    label="Account"
                    field="account"
                    rangeDays={rangeDays}
                    view={view}
                  />
                  <SortableHeader
                    label="Uploads"
                    field="uploads"
                    rangeDays={rangeDays}
                    view={view}
                    align="right"
                  />
                  <SortableHeader
                    label="Stored"
                    field="stored"
                    rangeDays={rangeDays}
                    view={view}
                  />
                  <SortableHeader
                    label="Keys"
                    field="keys"
                    rangeDays={rangeDays}
                    view={view}
                    align="right"
                  />
                  <SortableHeader
                    label="Last upload"
                    field="last"
                    rangeDays={rangeDays}
                    view={view}
                    align="right"
                  />
                  <SortableHeader
                    label="Joined"
                    field="joined"
                    rangeDays={rangeDays}
                    view={view}
                    align="right"
                  />
                  <th scope="col" className="w-64 px-4 py-2.5 font-medium">
                    Controls
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((user) => (
                  <UserTableRow key={user.id} user={user} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-border divide-y md:hidden">
            {items.map((user) => (
              <UserCard key={user.id} user={user} />
            ))}
          </div>
        </>
      )}

      <div className="border-border flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <p className="text-muted-foreground text-xs tabular-nums">
            {firstResult.toLocaleString("en-US")}–
            {lastResult.toLocaleString("en-US")} of{" "}
            {totalCount.toLocaleString("en-US")}
          </p>
        </div>
        <Pagination
          rangeDays={rangeDays}
          view={view}
          page={page}
          totalPages={totalPages}
        />
      </div>
    </section>
  );
}

function SortableHeader({
  label,
  field,
  rangeDays,
  view,
  align = "left",
}: {
  label: string;
  field: AdminUserSort;
  rangeDays: AdminRangeDays;
  view: AdminUserView;
  align?: "left" | "right";
}) {
  const active = view.sort === field;
  const nextDirection: AdminSortDirection = active
    ? view.direction === "asc"
      ? "desc"
      : "asc"
    : field === "account"
      ? "asc"
      : "desc";
  const Icon = active
    ? view.direction === "asc"
      ? ArrowUp
      : ArrowDown
    : ChevronsUpDown;

  return (
    <th
      scope="col"
      aria-sort={
        active
          ? view.direction === "asc"
            ? "ascending"
            : "descending"
          : undefined
      }
      className={
        "px-4 py-2.5 font-medium " +
        (field === "account" ? "w-[24%]" : field === "stored" ? "w-[18%]" : "")
      }
    >
      <Link
        href={buildAdminHref(rangeDays, view, {
          sort: field,
          direction: nextDirection,
          page: 1,
        })}
        scroll={false}
        className={
          "hover:text-foreground inline-flex items-center gap-1.5 transition-colors " +
          (active ? "text-accent " : "") +
          (align === "right" ? "w-full justify-end" : "")
        }
      >
        {label}
        <Icon aria-hidden="true" className="size-3.5" />
      </Link>
    </th>
  );
}

function UserTableRow({ user }: { user: AdminUserRow }) {
  return (
    <tr className="border-border hover:bg-sunken/45 border-b transition-colors last:border-b-0">
      <td className="px-4 py-3.5">
        <AccountIdentity user={user} showRole />
      </td>
      <td className="px-4 py-3.5 text-right tabular-nums">
        <span className="font-medium">
          {user.uploadCount.toLocaleString("en-US")}
        </span>
        {user.gifCount > 0 ? (
          <span className="text-muted-foreground block text-xs">
            {user.gifCount.toLocaleString("en-US")} GIF
          </span>
        ) : null}
      </td>
      <td className="px-4 py-3.5">
        <StorageUsage user={user} />
      </td>
      <td className="px-4 py-3.5 text-right font-medium tabular-nums">
        {user.activeKeyCount.toLocaleString("en-US")}
      </td>
      <td className="text-muted-foreground px-4 py-3.5 text-right text-xs tabular-nums">
        {user.lastUploadAt ? formatTimestamp(user.lastUploadAt) : "Never"}
      </td>
      <td className="text-muted-foreground px-4 py-3.5 text-right text-xs tabular-nums">
        {formatTimestamp(user.createdAt)}
      </td>
      <td className="px-4 py-3.5">
        <div className="flex flex-col items-start gap-2">
          <StorageQuotaControl user={user} />
          <ClearUserUploads user={user} />
        </div>
      </td>
    </tr>
  );
}

function UserCard({ user }: { user: AdminUserRow }) {
  return (
    <article className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <AccountIdentity user={user} />
        <RoleBadge role={user.appRole} />
      </div>
      <StorageUsage user={user} />
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <MobileFact
          label="Uploads"
          value={user.uploadCount.toLocaleString("en-US")}
        />
        <MobileFact
          label="GIFs"
          value={user.gifCount.toLocaleString("en-US")}
        />
        <MobileFact
          label="Keys"
          value={user.activeKeyCount.toLocaleString("en-US")}
        />
      </dl>
      <StorageQuotaControl user={user} />
      <ClearUserUploads user={user} />
      <p className="text-muted-foreground text-xs">
        Last upload{" "}
        {user.lastUploadAt ? formatTimestamp(user.lastUploadAt) : "never"}
        {" · Joined "}
        {formatTimestamp(user.createdAt)}
      </p>
    </article>
  );
}

function AccountIdentity({
  user,
  showRole = false,
}: {
  user: AdminUserRow;
  showRole?: boolean;
}) {
  const primary = user.name ?? user.email ?? "Unnamed user";
  const secondary = user.email && user.email !== primary ? user.email : null;
  const initial = primary.trim().charAt(0).toLocaleUpperCase() || "?";
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="bg-brand-muted text-brand grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold">
        {initial}
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate font-medium">{primary}</p>
          {showRole ? <RoleBadge role={user.appRole} /> : null}
        </div>
        {secondary ? (
          <p className="text-muted-foreground truncate text-xs">{secondary}</p>
        ) : null}
      </div>
    </div>
  );
}

function StorageUsage({ user }: { user: AdminUserRow }) {
  const used = BigInt(user.byteSize);
  const limit = user.effectiveStorageLimitBytes
    ? BigInt(user.effectiveStorageLimitBytes)
    : null;
  const percent =
    limit && limit > BigInt(0)
      ? Math.min(100, Number((used * BigInt(10_000)) / limit) / 100)
      : null;

  return (
    <div className="min-w-36">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium tabular-nums">
          {formatBytes(user.byteSize)}
        </span>
        <span className="text-muted-foreground truncate tabular-nums">
          {limit
            ? `${percent?.toFixed(percent && percent < 1 ? 1 : 0)}%`
            : "Unlimited"}
        </span>
      </div>
      {limit ? (
        <div className="bg-sunken mt-1.5 h-1.5 overflow-hidden rounded-full">
          <div
            className="bg-accent h-full rounded-full"
            style={{ width: `${Math.max(percent ?? 0, used > 0 ? 1.5 : 0)}%` }}
          />
        </div>
      ) : null}
      {limit ? (
        <p className="text-muted-foreground mt-1 text-[0.6875rem] tabular-nums">
          of {formatBytes(limit.toString(10))}
        </p>
      ) : null}
    </div>
  );
}

function RoleBadge({ role }: { role: AdminUserRow["appRole"] }) {
  return (
    <span
      className={
        "inline-flex rounded-md border px-2 py-0.5 text-[0.6875rem] font-semibold tracking-wide uppercase " +
        (role === "ADMIN"
          ? "border-accent/30 bg-accent/10 text-accent"
          : "border-border text-muted-foreground")
      }
    >
      {role === "ADMIN" ? "Admin" : "Member"}
    </span>
  );
}

function MobileFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function Pagination({
  rangeDays,
  view,
  page,
  totalPages,
}: {
  rangeDays: AdminRangeDays;
  view: AdminUserView;
  page: number;
  totalPages: number;
}) {
  return (
    <nav aria-label="People pages" className="flex items-center gap-2">
      <PageLink
        label="Previous page"
        href={buildAdminHref(rangeDays, view, { page: page - 1 })}
        disabled={page <= 1}
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        <span className="hidden sm:inline">Previous</span>
      </PageLink>
      <span className="text-muted-foreground min-w-20 text-center text-xs tabular-nums">
        Page {page.toLocaleString("en-US")} of{" "}
        {totalPages.toLocaleString("en-US")}
      </span>
      <PageLink
        label="Next page"
        href={buildAdminHref(rangeDays, view, { page: page + 1 })}
        disabled={page >= totalPages}
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRight aria-hidden="true" className="size-4" />
      </PageLink>
    </nav>
  );
}

function PageLink({
  label,
  href,
  disabled,
  children,
}: {
  label: string;
  href: Route;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const className =
    "border-border inline-flex h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold transition-colors";
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        aria-label={label}
        className={`${className} text-muted-foreground opacity-45`}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      scroll={false}
      prefetch
      aria-label={label}
      className={`${className} bg-panel hover:border-border-strong hover:bg-sunken`}
    >
      {children}
    </Link>
  );
}
