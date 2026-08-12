"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

import type {
  IndexedDemandSeries,
  MixedFrequencyChartDatum,
} from "@/lib/consumer-demand";

type DemandIndexChartProps = {
  data: MixedFrequencyChartDatum[];
  series: IndexedDemandSeries[];
  emptyMessage?: string;
};

function formatAxisDate(value: number): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function DemandTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const datum = payload[0]?.payload as MixedFrequencyChartDatum | undefined;
  if (!datum) {
    return null;
  }

  const points = Object.values(datum.points).filter(
    (point) => point !== undefined,
  );
  if (points.length === 0) {
    return null;
  }

  return (
    <div className="max-w-xs rounded-xl border border-zinc-700 bg-zinc-950/95 p-3 shadow-2xl">
      <div className="space-y-3">
        {points.map((point) => (
          <div key={point.seriesId}>
            <p className="text-xs font-semibold text-zinc-100">
              {point.country} · {point.source}
            </p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
              <dt className="text-zinc-600">Period</dt>
              <dd className="text-right text-zinc-300">
                {point.originalPeriod}
              </dd>
              <dt className="text-zinc-600">Frequency</dt>
              <dd className="text-right text-zinc-300 capitalize">
                {point.frequency}
              </dd>
              <dt className="text-zinc-600">Index</dt>
              <dd className="font-data text-right text-zinc-100">
                {point.indexedValue.toFixed(1)}
              </dd>
              <dt className="text-zinc-600">Published</dt>
              <dd className="font-data text-right text-zinc-300">
                {point.originalValue} {point.unit}
              </dd>
              <dt className="text-zinc-600">Basis</dt>
              <dd className="text-right text-zinc-300 capitalize">
                {point.basis}
                {point.annualized ? " · SAAR" : ""}
              </dd>
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DemandIndexChart({
  data,
  series,
  emptyMessage = "No valid observations are available for this comparison.",
}: DemandIndexChartProps) {
  const availableSeries = series.filter((item) => item.points.length > 0);

  if (data.length === 0 || availableSeries.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-950 px-6 text-center text-sm text-zinc-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div>
      <div
        className="h-80 w-full"
        role="img"
        aria-label="Indexed recreation and culture demand time series"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 14, bottom: 4, left: -8 }}
          >
            <CartesianGrid
              stroke="#27272a"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={formatAxisDate}
              axisLine={{ stroke: "#3f3f46" }}
              tickLine={false}
              tick={{ fill: "#71717a", fontSize: 11 }}
              minTickGap={40}
            />
            <YAxis
              domain={["auto", "auto"]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickFormatter={(value: number) => value.toFixed(0)}
              width={46}
            />
            <Tooltip
              content={DemandTooltip}
              cursor={{ stroke: "#52525b", strokeDasharray: "3 3" }}
            />
            {availableSeries.map((item) => (
              <Line
                key={item.id}
                type="linear"
                dataKey={`values.${item.id}`}
                name={item.country}
                stroke={item.color}
                strokeWidth={2}
                connectNulls
                dot={
                  item.points[0]?.frequency === "quarterly"
                    ? { r: 2.5, fill: item.color, strokeWidth: 0 }
                    : false
                }
                activeDot={{ r: 4, fill: item.color, stroke: "#09090b" }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {series.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              <p className="text-xs font-medium text-zinc-300">
                {item.country}
              </p>
            </div>
            <p className="mt-1 text-[11px] text-zinc-600">
              {item.points.length > 0
                ? `${item.source} · ${item.points[0].frequency} · baseline ${item.points[0].originalPeriod}`
                : item.unavailableReason}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-5 text-zinc-600">
        Culture Crisis Tracker presentation-layer index. Lines connect only
        published observations; no values are interpolated, forward-filled, or
        persisted. Quarterly UK points remain quarterly.
      </p>
    </div>
  );
}
