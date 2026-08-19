"use client";

import { HardDrive } from "lucide-react";
import { useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatBytes } from "~/components/lib/format";
import type { LibraryTrend } from "~/components/data/uploads";

const tooltipStyle = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: "0.625rem",
  boxShadow:
    "0 12px 30px color-mix(in oklab, var(--foreground) 12%, transparent)",
  color: "var(--foreground)",
  fontSize: "0.75rem",
} as const;

export function LibraryTrendChart({
  trend,
  storage,
  noun,
}: {
  trend: LibraryTrend;
  storage: {
    usedBytes: string;
    reservedBytes: string;
    limitBytes: string | null;
    unlimited: boolean;
    inherited: boolean;
    percent: number | null;
  };
  noun: string;
}) {
  const gradientId = useId();
  const chartData = trend.points.map((point) => ({
    ...point,
    bytes: Number(point.byteSize),
  }));
  const hasActivity = trend.totalUploads > 0;

  return (
    <section
      aria-labelledby="library-pulse-heading"
      className="border-border bg-panel mb-7 overflow-hidden rounded-xl border"
    >
      <div className="border-border flex flex-wrap items-start justify-between gap-4 border-b px-4 py-4 sm:px-5">
        <div>
          <h2
            id="library-pulse-heading"
            className="font-display text-base font-semibold"
          >
            Library pulse
          </h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {hasActivity
              ? `${capitalize(noun)} added over the last ${trend.days} days.`
              : `Your ${noun} trend starts with the next upload.`}
          </p>
        </div>
        <dl className="grid w-full grid-cols-3 gap-x-5 text-left sm:w-auto sm:gap-x-8 sm:text-right">
          <Metric
            label="Uploads"
            value={trend.totalUploads.toLocaleString("en-US")}
          />
          <Metric label="Added" value={formatBytes(trend.totalByteSize)} />
          <Metric
            label="Busiest"
            value={
              trend.busiestLabel
                ? `${trend.busiestLabel} · ${trend.busiestUploads}`
                : "—"
            }
          />
        </dl>
      </div>

      <StorageMeter storage={storage} />

      {hasActivity ? (
        <div className="grid gap-0 lg:grid-cols-2">
          <ChartFrame title="Upload rhythm">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 560, height: 176 }}
            >
              <AreaChart
                data={chartData}
                margin={{ top: 8, right: 4, bottom: 0, left: -24 }}
                accessibilityLayer
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="var(--accent)"
                      stopOpacity={0.32}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--accent)"
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  stroke="var(--border)"
                  strokeDasharray="3 4"
                />
                <XAxis dataKey="label" {...axisProps} minTickGap={28} />
                <YAxis allowDecimals={false} {...axisProps} width={34} />
                <Tooltip
                  cursor={{ stroke: "var(--accent)", strokeOpacity: 0.35 }}
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: "var(--muted-foreground)" }}
                  formatter={(value) => [
                    Number(value).toLocaleString(),
                    "Uploads",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="uploads"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  activeDot={{ r: 4, strokeWidth: 2, fill: "var(--panel)" }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartFrame>

          <ChartFrame title="Storage added" divided>
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 560, height: 176 }}
            >
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 4, bottom: 0, left: -8 }}
                barCategoryGap="32%"
                accessibilityLayer
              >
                <CartesianGrid
                  vertical={false}
                  stroke="var(--border)"
                  strokeDasharray="3 4"
                />
                <XAxis dataKey="label" {...axisProps} minTickGap={28} />
                <YAxis
                  {...axisProps}
                  width={54}
                  tickFormatter={(value) => compactBytes(Number(value))}
                />
                <Tooltip
                  cursor={{ fill: "var(--sunken)" }}
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: "var(--muted-foreground)" }}
                  formatter={(value) => [formatBytes(Number(value)), "Added"]}
                />
                <Bar
                  dataKey="bytes"
                  fill="var(--chart-video)"
                  maxBarSize={24}
                  radius={[4, 4, 1, 1]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>
      ) : (
        <div className="text-muted-foreground grid min-h-44 place-items-center px-5 text-center text-sm">
          Upload something and this panel will chart its pace and storage cost.
        </div>
      )}

      <div className="sr-only">
        <table>
          <caption>{capitalize(noun)} uploaded per UTC day</caption>
          <thead>
            <tr>
              <th>Date</th>
              <th>Uploads</th>
              <th>Bytes added</th>
            </tr>
          </thead>
          <tbody>
            {trend.points.map((point) => (
              <tr key={point.date}>
                <th>{point.date}</th>
                <td>{point.uploads}</td>
                <td>{point.byteSize}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StorageMeter({
  storage,
}: {
  storage: {
    usedBytes: string;
    reservedBytes: string;
    limitBytes: string | null;
    unlimited: boolean;
    inherited: boolean;
    percent: number | null;
  };
}) {
  const reserved = BigInt(storage.reservedBytes);
  return (
    <div className="border-border flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 sm:px-5">
      <HardDrive
        aria-hidden="true"
        className="text-muted-foreground size-4 shrink-0"
      />
      <div className="min-w-44 flex-1">
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="font-medium">
            {formatBytes(storage.usedBytes)} stored
          </span>
          <span className="text-muted-foreground tabular-nums">
            {storage.unlimited
              ? "No storage limit"
              : `${formatBytes(storage.limitBytes ?? "0")} limit${storage.inherited ? " · account default" : ""}`}
          </span>
        </div>
        {storage.unlimited ? null : (
          <div
            role="progressbar"
            aria-label="Account storage used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={storage.percent ?? 0}
            className="bg-sunken mt-2 h-1.5 overflow-hidden rounded-full"
          >
            <div
              className="bg-accent h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${storage.percent ?? 0}%` }}
            />
          </div>
        )}
      </div>
      {reserved > BigInt(0) ? (
        <span className="text-muted-foreground text-xs">
          {formatBytes(reserved)} currently uploading
        </span>
      ) : null}
    </div>
  );
}

const axisProps = {
  axisLine: false,
  tickLine: false,
  tick: { fill: "var(--muted-foreground)", fontSize: 10 },
} as const;

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-[0.625rem] font-medium tracking-[0.08em] uppercase">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-semibold tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function ChartFrame({
  title,
  divided = false,
  children,
}: {
  title: string;
  divided?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        (divided ? "border-border border-t lg:border-t-0 lg:border-l " : "") +
        "min-w-0 px-4 pt-3 pb-4 sm:px-5"
      }
    >
      <p className="text-muted-foreground mb-1 text-xs font-medium">{title}</p>
      <div aria-hidden="true" className="h-44 min-w-0">
        {children}
      </div>
    </div>
  );
}

function compactBytes(bytes: number): string {
  if (bytes <= 0) return "0";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}K`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)}M`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}G`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
