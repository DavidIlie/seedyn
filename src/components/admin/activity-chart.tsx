"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DailyUploadPoint } from "~/server/admin/insights-view";

const SERIES = [
  { key: "IMAGE", name: "Images", color: "var(--chart-image)" },
  { key: "VIDEO", name: "Videos", color: "var(--chart-video)" },
  { key: "FILE", name: "Files", color: "var(--chart-file)" },
  { key: "TEXT", name: "Text", color: "var(--chart-text)" },
] as const;

export function ActivityChart({ data }: { data: DailyUploadPoint[] }) {
  return (
    <div aria-hidden="true" className="h-64 min-w-0">
      <ResponsiveContainer
        width="100%"
        height="100%"
        initialDimension={{ width: 720, height: 256 }}
      >
        <BarChart
          data={data}
          margin={{ top: 8, right: 4, bottom: 0, left: -12 }}
          barCategoryGap="24%"
          accessibilityLayer
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeDasharray="3 4"
          />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            minTickGap={24}
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
            cursor={{ fill: "var(--sunken)" }}
            contentStyle={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: "0.5rem",
              color: "var(--foreground)",
              fontSize: "0.75rem",
            }}
            labelStyle={{ color: "var(--muted-foreground)" }}
          />
          <Legend
            iconType="square"
            iconSize={8}
            wrapperStyle={{ fontSize: "0.75rem", color: "var(--foreground)" }}
          />
          {SERIES.map((series) => (
            <Bar
              key={series.key}
              dataKey={series.key}
              name={series.name}
              stackId="uploads"
              fill={series.color}
              radius={series.key === "TEXT" ? [3, 3, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
