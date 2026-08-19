import { Database, FileUp, KeyRound, UsersRound } from "lucide-react";
import Link from "next/link";

import { formatBytes } from "~/components/lib/format";
import { uploadOriginLabel } from "~/components/upload/origin-badge";
import type {
  AdminKindTotal,
  AdminOriginTotal,
  AdminOverview,
} from "~/server/admin/insights";
import {
  ADMIN_RANGE_DAYS,
  buildAdminHref,
  type AdminUserView,
} from "~/server/admin/insights-view";

import { ActivityChart } from "./activity-chart";

const KIND_LABEL: Record<AdminKindTotal["kind"], string> = {
  IMAGE: "Images",
  VIDEO: "Videos",
  FILE: "Files",
  TEXT: "Text",
};

export function AdminFleet({ overview }: { overview: AdminOverview }) {
  const facts = [
    {
      label: "Users",
      value: overview.summary.userCount.toLocaleString("en-US"),
      detail: "invite-only accounts",
      icon: UsersRound,
    },
    {
      label: "Uploads",
      value: overview.summary.uploadCount.toLocaleString("en-US"),
      detail: "original objects",
      icon: FileUp,
    },
    {
      label: "Stored",
      value: formatBytes(overview.summary.totalByteSize),
      detail: `${formatBytes(overview.summary.variantByteSize)} in GIF variants`,
      icon: Database,
    },
    {
      label: "Active keys",
      value: overview.summary.activeApiKeyCount.toLocaleString("en-US"),
      detail: "usable credentials",
      icon: KeyRound,
    },
  ];

  return (
    <div className="space-y-4">
      <section aria-label="Seedyn totals" className="border-border border-y">
        <dl className="grid grid-cols-2 lg:grid-cols-4">
          {facts.map(({ label, value, detail, icon: Icon }, index) => (
            <div
              key={label}
              className={
                "border-border min-w-0 py-4 " +
                (index % 2 === 0 ? "pr-4 " : "border-l pl-4 ") +
                (index < 2 ? "border-b lg:border-b-0 " : "") +
                (index > 1 ? "lg:border-l lg:px-5" : "")
              }
            >
              <dt className="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
                <Icon aria-hidden="true" className="text-accent size-3.5" />
                {label}
              </dt>
              <dd className="font-display mt-2 truncate text-[1.65rem] leading-none font-semibold tracking-[-0.025em] tabular-nums">
                {value}
              </dd>
              <p className="text-muted-foreground mt-1.5 truncate text-xs">
                {detail}
              </p>
            </div>
          ))}
        </dl>
      </section>

      {overview.summary.failedObjectCount > 0 ? (
        <p
          role="status"
          className="border-danger bg-danger/5 text-danger rounded-lg border px-4 py-3 text-sm"
        >
          {overview.summary.failedObjectCount.toLocaleString("en-US")} stored{" "}
          {overview.summary.failedObjectCount === 1
            ? "object needs"
            : "objects need"}{" "}
          deletion review.
        </p>
      ) : null}
    </div>
  );
}

export function AdminOperations({
  overview,
  userView,
}: {
  overview: AdminOverview;
  userView: AdminUserView;
}) {
  const hasActivity = overview.daily.some((point) => point.total > 0);

  return (
    <section
      aria-labelledby="activity-heading"
      className="border-border bg-panel overflow-hidden rounded-xl border"
    >
      <div className="border-border flex flex-wrap items-start justify-between gap-4 border-b px-4 py-4 sm:px-5">
        <div>
          <h2
            id="activity-heading"
            className="font-display text-base font-semibold"
          >
            Activity
          </h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Upload pace and current storage composition, in UTC.
          </p>
        </div>
        <RangePicker selected={overview.rangeDays} userView={userView} />
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.8fr)]">
        <div className="min-w-0 p-4 sm:p-5 lg:border-r">
          {hasActivity ? (
            <>
              <ActivityChart data={overview.daily} />
              <ActivityDataTable overview={overview} />
            </>
          ) : (
            <div className="grid h-40 place-items-center text-center">
              <div>
                <p className="font-display text-sm font-semibold">
                  No uploads in this period
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Choose a longer range or upload a new object.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="border-border divide-border grid divide-y border-t sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:block lg:divide-x-0 lg:divide-y lg:border-t-0">
          <StorageByType kinds={overview.kinds} />
          <UploadSources origins={overview.origins} />
        </div>
      </div>
    </section>
  );
}

function RangePicker({
  selected,
  userView,
}: {
  selected: AdminOverview["rangeDays"];
  userView: AdminUserView;
}) {
  return (
    <nav
      aria-label="Upload activity range"
      className="border-border bg-sunken flex rounded-lg border p-0.5"
    >
      {ADMIN_RANGE_DAYS.map((days) => (
        <Link
          key={days}
          href={buildAdminHref(selected, userView, { rangeDays: days })}
          scroll={false}
          prefetch
          aria-current={days === selected ? "page" : undefined}
          className="text-muted-foreground hover:text-foreground aria-[current=page]:bg-panel aria-[current=page]:text-accent grid h-9 min-w-12 place-items-center rounded-md px-2 text-xs font-medium transition-colors aria-[current=page]:shadow-sm"
        >
          {days}d
        </Link>
      ))}
    </nav>
  );
}

function ActivityDataTable({ overview }: { overview: AdminOverview }) {
  const activeDays = overview.daily.filter((point) => point.total > 0);
  return (
    <div className="sr-only">
      <table>
        <caption>
          Uploads per UTC day for the selected range. Unlisted days had no
          uploads.
        </caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Uploads</th>
          </tr>
        </thead>
        <tbody>
          {activeDays.map((point) => (
            <tr key={point.date}>
              <th>{point.date}</th>
              <td>{point.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StorageByType({ kinds }: { kinds: AdminKindTotal[] }) {
  const visibleKinds = kinds.filter((kind) => kind.count > 0);
  const maximum = visibleKinds.reduce((current, kind) => {
    const value = BigInt(kind.byteSize);
    return value > current ? value : current;
  }, BigInt(0));

  return (
    <section aria-labelledby="storage-heading" className="p-4 sm:p-5">
      <h3 id="storage-heading" className="font-display text-sm font-semibold">
        Storage by type
      </h3>
      {visibleKinds.length > 0 ? (
        <div className="mt-4 space-y-3.5">
          {visibleKinds.map((kind) => {
            const byteSize = BigInt(kind.byteSize);
            const width =
              maximum === BigInt(0)
                ? 0
                : Number((byteSize * BigInt(10_000)) / maximum) / 100;
            return (
              <div key={kind.kind}>
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-medium">{KIND_LABEL[kind.kind]}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatBytes(kind.byteSize)} · {kind.count}
                  </span>
                </div>
                <div className="bg-sunken mt-1.5 h-1.5 overflow-hidden rounded-full">
                  <div
                    className="bg-accent h-full rounded-full"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-muted-foreground mt-3 text-sm">No stored objects.</p>
      )}
    </section>
  );
}

function UploadSources({ origins }: { origins: AdminOriginTotal[] }) {
  const visibleOrigins = origins.filter((origin) => origin.count > 0);
  const total = visibleOrigins.reduce((sum, origin) => sum + origin.count, 0);

  return (
    <section aria-labelledby="sources-heading" className="p-4 sm:p-5">
      <h3 id="sources-heading" className="font-display text-sm font-semibold">
        Ingress
      </h3>
      {visibleOrigins.length > 0 ? (
        <dl className="mt-3 space-y-2.5">
          {visibleOrigins.map((origin) => (
            <div
              key={origin.origin}
              className="flex items-baseline justify-between gap-3 text-xs"
            >
              <dt className="font-medium">
                {uploadOriginLabel(origin.origin)}
              </dt>
              <dd className="text-muted-foreground text-right tabular-nums">
                {origin.count.toLocaleString("en-US")} ·{" "}
                {Math.round((origin.count / total) * 100)}%
                <span className="ml-1.5">{formatBytes(origin.byteSize)}</span>
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-muted-foreground mt-3 text-sm">No upload sources.</p>
      )}
    </section>
  );
}
