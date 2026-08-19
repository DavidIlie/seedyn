import Link from "next/link";

import { setUserStorageQuota } from "~/app/(app)/admin/actions";

import {
  formatBytes,
  formatTimestamp,
  uploadKindLabel,
} from "~/components/lib/format";
import {
  UploadOriginBadge,
  uploadOriginLabel,
} from "~/components/upload/origin-badge";
import type {
  AdminInsights,
  AdminKindTotal,
  AdminOriginTotal,
  AdminRecentUpload,
  AdminUserRow,
} from "~/server/admin/insights";
import { ADMIN_RANGE_DAYS } from "~/server/admin/insights-view";

import { ActivityChart } from "./activity-chart";

const KIND_LABEL: Record<AdminKindTotal["kind"], string> = {
  IMAGE: "Images",
  VIDEO: "Videos",
  FILE: "Files",
  TEXT: "Text",
};

export function AdminLedger({ insights }: { insights: AdminInsights }) {
  const hasActivity = insights.daily.some((point) => point.total > 0);

  return (
    <div className="space-y-8 pb-16">
      <SummaryRail insights={insights} />

      {insights.summary.failedObjectCount > 0 ? (
        <p
          role="status"
          className="border-danger bg-danger/5 text-danger rounded-lg border px-4 py-3 text-sm"
        >
          {insights.summary.failedObjectCount.toLocaleString("en-US")} stored{" "}
          {insights.summary.failedObjectCount === 1
            ? "object needs"
            : "objects need"}{" "}
          deletion review.
        </p>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(17rem,1fr)]">
        <section
          aria-labelledby="activity-heading"
          className="border-border bg-panel min-w-0 rounded-xl border"
        >
          <div className="border-border flex flex-wrap items-start justify-between gap-4 border-b px-5 py-4">
            <div>
              <h2
                id="activity-heading"
                className="font-display text-base font-semibold"
              >
                Upload activity
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Current stored uploads by creation day, in UTC.
              </p>
            </div>
            <RangePicker selected={insights.rangeDays} />
          </div>
          <div className="p-4 sm:p-5">
            {hasActivity ? (
              <>
                <ActivityChart data={insights.daily} />
                <ActivityDataTable insights={insights} />
              </>
            ) : (
              <div className="grid h-64 place-items-center text-center">
                <div>
                  <p className="font-display text-sm font-semibold">
                    No uploads in this period
                  </p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Activity appears after the first completed upload.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="space-y-5">
          <StorageByType kinds={insights.kinds} />
          <UploadSources origins={insights.origins} />
        </div>
      </div>

      <UserLedger users={insights.users} />
      <RecentUploads uploads={insights.recentUploads} />
    </div>
  );
}

function SummaryRail({ insights }: { insights: AdminInsights }) {
  const facts = [
    {
      label: "Users",
      value: insights.summary.userCount.toLocaleString("en-US"),
      detail: "signed in",
    },
    {
      label: "Uploads",
      value: insights.summary.uploadCount.toLocaleString("en-US"),
      detail: "originals",
    },
    {
      label: "Stored",
      value: formatBytes(insights.summary.totalByteSize),
      detail: formatBytes(insights.summary.variantByteSize) + " in GIFs",
    },
    {
      label: "GIF variants",
      value: insights.summary.variantCount.toLocaleString("en-US"),
      detail: "derived objects",
    },
    {
      label: "Active API keys",
      value: insights.summary.activeApiKeyCount.toLocaleString("en-US"),
      detail: "not expired",
    },
  ];

  return (
    <section
      aria-label="Seedyn totals"
      className="border-border bg-panel rounded-xl border"
    >
      <dl className="grid grid-cols-2 overflow-hidden rounded-xl lg:grid-cols-5">
        {facts.map((fact, index) => (
          <div
            key={fact.label}
            className={
              "border-border min-w-0 px-4 py-4 lg:border-b-0 lg:px-5 " +
              (index < 4 ? "border-b lg:border-r " : "") +
              (index % 2 === 0 && index < 4 ? "border-r " : "") +
              (index === 4 ? "col-span-2 lg:col-span-1" : "")
            }
          >
            <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {fact.label}
            </dt>
            <dd className="font-display mt-2 truncate text-xl font-semibold tabular-nums">
              {fact.value}
            </dd>
            <p className="text-muted-foreground mt-0.5 truncate text-xs">
              {fact.detail}
            </p>
          </div>
        ))}
      </dl>
    </section>
  );
}

function RangePicker({ selected }: { selected: AdminInsights["rangeDays"] }) {
  return (
    <nav
      aria-label="Upload activity range"
      className="border-border bg-sunken flex rounded-lg border p-0.5"
    >
      {ADMIN_RANGE_DAYS.map((days) => (
        <Link
          key={days}
          href={{ pathname: "/admin", query: { range: days } }}
          scroll={false}
          aria-current={days === selected ? "page" : undefined}
          className={
            "grid h-9 min-w-12 place-items-center rounded-md px-2 text-xs font-medium transition-colors " +
            (days === selected
              ? "bg-panel text-accent shadow-sm"
              : "text-muted-foreground hover:text-foreground")
          }
        >
          {days}d
        </Link>
      ))}
    </nav>
  );
}

function ActivityDataTable({ insights }: { insights: AdminInsights }) {
  return (
    <table className="sr-only">
      <caption>Uploads per UTC day for the selected range</caption>
      <thead>
        <tr>
          <th>Date</th>
          <th>Images</th>
          <th>Videos</th>
          <th>Files</th>
          <th>Text</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {insights.daily.map((point) => (
          <tr key={point.date}>
            <th>{point.date}</th>
            <td>{point.IMAGE}</td>
            <td>{point.VIDEO}</td>
            <td>{point.FILE}</td>
            <td>{point.TEXT}</td>
            <td>{point.total}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StorageByType({ kinds }: { kinds: AdminKindTotal[] }) {
  const maximum = kinds.reduce((current, kind) => {
    const value = BigInt(kind.byteSize);
    return value > current ? value : current;
  }, BigInt(0));

  return (
    <section
      aria-labelledby="storage-heading"
      className="border-border bg-panel rounded-xl border"
    >
      <div className="border-border border-b px-5 py-4">
        <h2
          id="storage-heading"
          className="font-display text-base font-semibold"
        >
          Storage by type
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Original objects; GIF variants are reported above.
        </p>
      </div>
      <div className="space-y-5 p-5">
        {kinds.map((kind) => {
          const byteSize = BigInt(kind.byteSize);
          const width =
            maximum === BigInt(0)
              ? 0
              : Number((byteSize * BigInt(10_000)) / maximum) / 100;
          return (
            <div key={kind.kind}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{KIND_LABEL[kind.kind]}</span>
                <span className="text-muted-foreground tabular-nums">
                  {formatBytes(kind.byteSize)} ·{" "}
                  {kind.count.toLocaleString("en-US")}
                </span>
              </div>
              <div className="bg-sunken mt-2 h-2 overflow-hidden rounded-full">
                <div
                  className="bg-accent h-full min-w-0 rounded-full"
                  style={{ width: String(width) + "%" }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function UploadSources({ origins }: { origins: AdminOriginTotal[] }) {
  const total = origins.reduce((sum, origin) => sum + origin.count, 0);
  return (
    <section
      aria-labelledby="sources-heading"
      className="border-border bg-panel rounded-xl border"
    >
      <div className="border-border border-b px-5 py-4">
        <h2
          id="sources-heading"
          className="font-display text-base font-semibold"
        >
          Upload sources
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Durable ingress audit across stored originals.
        </p>
      </div>
      <dl className="divide-border divide-y px-5">
        {origins.map((origin) => (
          <div
            key={origin.origin}
            className="flex items-baseline justify-between gap-3 py-3 text-sm"
          >
            <dt className="font-medium">{uploadOriginLabel(origin.origin)}</dt>
            <dd className="text-muted-foreground text-right tabular-nums">
              {origin.count.toLocaleString("en-US")}
              {total > 0
                ? ` · ${Math.round((origin.count / total) * 100)}%`
                : ""}
              <span className="block text-[0.6875rem]">
                {formatBytes(origin.byteSize)}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function UserLedger({ users }: { users: AdminUserRow[] }) {
  return (
    <section aria-labelledby="users-heading">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id="users-heading" className="font-display text-base font-semibold">
          Users
        </h2>
        <p className="text-muted-foreground text-sm">
          {users.length.toLocaleString("en-US")} total
        </p>
      </div>

      <div className="border-border bg-panel hidden overflow-hidden rounded-xl border md:block">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="bg-sunken/70 text-muted-foreground text-xs">
            <tr>
              <th className="w-[25%] px-4 py-3 font-medium">Account</th>
              <th className="w-[8%] px-3 py-3 font-medium">Role</th>
              <th className="w-[9%] px-3 py-3 text-right font-medium">
                Uploads
              </th>
              <th className="w-[10%] px-3 py-3 text-right font-medium">
                Stored
              </th>
              <th className="w-[23%] px-3 py-3 font-medium">Storage limit</th>
              <th className="w-[8%] px-3 py-3 text-right font-medium">Keys</th>
              <th className="w-[17%] px-4 py-3 text-right font-medium">
                Last upload
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <UserTableRow key={user.id} user={user} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 md:hidden">
        {users.map((user) => (
          <UserCard key={user.id} user={user} />
        ))}
      </div>
    </section>
  );
}

function UserTableRow({ user }: { user: AdminUserRow }) {
  return (
    <tr className="border-border border-t first:border-t-0">
      <td className="min-w-0 px-4 py-3">
        <p className="truncate font-medium">
          {user.name ?? user.email ?? "Unnamed user"}
        </p>
        {user.email && user.email !== user.name ? (
          <p className="text-muted-foreground truncate text-xs">{user.email}</p>
        ) : null}
      </td>
      <td className="px-3 py-3">
        <RoleBadge role={user.appRole} />
      </td>
      <td className="px-3 py-3 text-right tabular-nums">
        {user.uploadCount.toLocaleString("en-US")}
        {user.gifCount > 0 ? (
          <span className="text-muted-foreground block text-xs">
            {user.gifCount.toLocaleString("en-US")} GIF
          </span>
        ) : null}
      </td>
      <td className="px-3 py-3 text-right tabular-nums">
        {formatBytes(user.byteSize)}
      </td>
      <td className="px-3 py-3">
        <StorageQuotaControl user={user} />
      </td>
      <td className="px-3 py-3 text-right tabular-nums">
        {user.activeKeyCount}
      </td>
      <td className="text-muted-foreground px-4 py-3 text-right text-xs">
        {user.lastUploadAt ? formatTimestamp(user.lastUploadAt) : "Never"}
      </td>
    </tr>
  );
}

function UserCard({ user }: { user: AdminUserRow }) {
  return (
    <article className="border-border bg-panel rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {user.name ?? user.email ?? "Unnamed user"}
          </p>
          {user.email && user.email !== user.name ? (
            <p className="text-muted-foreground truncate text-xs">
              {user.email}
            </p>
          ) : null}
        </div>
        <RoleBadge role={user.appRole} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <MobileFact
          label="Uploads"
          value={user.uploadCount.toLocaleString("en-US")}
        />
        <MobileFact label="Stored" value={formatBytes(user.byteSize)} />
        <MobileFact
          label="Storage limit"
          value={
            user.effectiveStorageLimitBytes
              ? formatBytes(user.effectiveStorageLimitBytes)
              : "Unlimited"
          }
        />
        <MobileFact
          label="GIFs"
          value={user.gifCount.toLocaleString("en-US")}
        />
        <MobileFact
          label="Active keys"
          value={user.activeKeyCount.toLocaleString("en-US")}
        />
      </dl>
      <div className="mt-4">
        <StorageQuotaControl user={user} />
      </div>
    </article>
  );
}

const QUOTA_OPTIONS = [
  { value: "default", label: "Default · 5 GB" },
  { value: "10", label: "10 GB" },
  { value: "25", label: "25 GB" },
  { value: "50", label: "50 GB" },
  { value: "100", label: "100 GB" },
  { value: "250", label: "250 GB" },
] as const;

function StorageQuotaControl({ user }: { user: AdminUserRow }) {
  if (user.appRole === "ADMIN") {
    return <span className="text-muted-foreground text-xs">Unlimited</span>;
  }
  const selected = user.storageLimitBytes
    ? String(BigInt(user.storageLimitBytes) / BigInt(1_000_000_000))
    : "default";
  return (
    <form action={setUserStorageQuota} className="flex items-center gap-1.5">
      <input type="hidden" name="userId" value={user.id} />
      <select
        name="limitGb"
        defaultValue={selected}
        aria-label={`Storage limit for ${user.email ?? user.name ?? "user"}`}
        className="border-border bg-panel h-9 min-w-0 flex-1 rounded-md border px-2 text-xs"
      >
        {QUOTA_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="border-border bg-panel hover:bg-sunken h-9 rounded-md border px-2 text-xs font-medium"
      >
        Set
      </button>
    </form>
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

function RoleBadge({ role }: { role: AdminUserRow["appRole"] }) {
  return (
    <span
      className={
        "inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase " +
        (role === "ADMIN"
          ? "border-accent/30 bg-accent/10 text-accent"
          : "border-border text-muted-foreground")
      }
    >
      {role === "ADMIN" ? "Admin" : "Member"}
    </span>
  );
}

function RecentUploads({ uploads }: { uploads: AdminRecentUpload[] }) {
  return (
    <section aria-labelledby="recent-admin-heading">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2
          id="recent-admin-heading"
          className="font-display text-base font-semibold"
        >
          Recent uploads
        </h2>
        <p className="text-muted-foreground text-sm">Latest 12 across Seedyn</p>
      </div>
      {uploads.length === 0 ? (
        <div className="border-border bg-sunken/45 rounded-xl border border-dashed px-6 py-10 text-center">
          <p className="font-display text-sm font-semibold">
            No stored content yet
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            Completed uploads will appear here with their owner and lifecycle
            state.
          </p>
        </div>
      ) : (
        <div className="border-border bg-panel overflow-hidden rounded-xl border">
          <ul>
            {uploads.map((upload) => (
              <RecentUploadRow key={upload.id} upload={upload} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function RecentUploadRow({ upload }: { upload: AdminRecentUpload }) {
  const owner = upload.owner.name ?? upload.owner.email ?? "Unknown owner";
  return (
    <li className="border-border flex flex-col gap-2 border-b px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
      <span className="border-border bg-sunken text-muted-foreground grid size-10 shrink-0 place-items-center rounded-lg border font-mono text-[10px] font-semibold">
        {upload.kind.slice(0, 3)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{upload.originalName}</p>
        <p className="text-muted-foreground mt-0.5 truncate text-xs">
          {owner} · {uploadKindLabel(upload.kind, upload.contentType)}
        </p>
        <UploadOriginBadge provenance={upload.provenance} className="mt-1.5" />
      </div>
      <div className="text-muted-foreground flex shrink-0 items-center justify-between gap-4 text-xs sm:block sm:text-right">
        <p>{formatBytes(upload.byteSize)}</p>
        <p className="mt-0.5">{formatTimestamp(upload.createdAt)}</p>
      </div>
    </li>
  );
}
