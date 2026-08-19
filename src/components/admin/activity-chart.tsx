"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
  type TooltipValueType,
} from "recharts";

import type { DailyUploadPoint } from "~/server/admin/insights-view";

export function ActivityChart({ data }: { data: DailyUploadPoint[] }) {
  return (
    <div aria-hidden="true" className="h-40 min-w-0">
      <ResponsiveContainer
        width="100%"
        height="100%"
        initialDimension={{ width: 720, height: 160 }}
      >
        <BarChart
          data={data}
          margin={{ top: 6, right: 4, bottom: 0, left: -12 }}
          barCategoryGap="22%"
          accessibilityLayer
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeDasharray="3 5"
          />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            minTickGap={28}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            width={34}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <Tooltip
            cursor={{ fill: "var(--accent)", fillOpacity: 0.06 }}
            content={ActivityTooltip}
          />
          <Bar
            dataKey="total"
            name="Uploads"
            fill="var(--chart-image)"
            radius={[3, 3, 0, 0]}
            maxBarSize={18}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ActivityTooltip({
  active,
  payload,
  label,
}: TooltipContentProps<TooltipValueType, number | string>) {
  if (!active || !payload?.length) return null;
  const count = Number(payload[0]?.value ?? 0);
  return (
    <div className="border-border bg-panel rounded-lg border px-3 py-2 text-xs shadow-lg">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold tabular-nums">
        {count.toLocaleString("en-US")} {count === 1 ? "upload" : "uploads"}
      </p>
    </div>
  );
}
