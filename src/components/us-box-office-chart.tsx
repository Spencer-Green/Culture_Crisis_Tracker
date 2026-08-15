"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { BoxOfficeChartPoint } from "@/services/film/us-box-office-analytics";
import {
  calendarTicks,
  chartTimestamp,
  filterChartRange,
  formatCalendarTick,
  formatExactPeriod,
} from "@/lib/chart-axis";

type Range = "1Y" | "5Y" | "2019" | "MAX";

function compactUsd(value: number): string {
  return value >= 1_000_000_000
    ? `$${(value / 1_000_000_000).toFixed(1)}B`
    : `$${(value / 1_000_000).toFixed(0)}M`;
}

export function USBoxOfficeChart({ data }: { data: BoxOfficeChartPoint[] }) {
  const [range, setRange] = useState<Range>("5Y");
  const [mode, setMode] = useState<"weekly" | "rolling">("rolling");
  const filtered = useMemo(() => {
    const withTime = data.map((point) => ({
      ...point,
      timestamp: chartTimestamp(point.date, "weekly"),
    }));
    return filterChartRange(withTime, (point) => point.timestamp, range);
  }, [data, range]);
  const ticks = calendarTicks(
    filtered.map((point) => point.timestamp),
    { frequency: "weekly", range },
  );
  const dataKey = mode === "weekly" ? "weeklyGrossUsd" : "rolling4WeekGrossUsd";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-950 p-1">
          {(["weekly", "rolling"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`rounded-md px-3 py-1.5 text-xs ${mode === value ? "bg-blue-600 text-white" : "text-zinc-500"}`}
            >
              {value === "weekly" ? "Weekly" : "4-week rolling"}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-950 p-1">
          {(["1Y", "5Y", "2019", "MAX"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRange(value)}
              className={`rounded-md px-3 py-1.5 text-xs ${range === value ? "bg-zinc-700 text-white" : "text-zinc-500"}`}
            >
              {value === "2019"
                ? "Since 2019"
                : value === "MAX"
                  ? "Max"
                  : value}
            </button>
          ))}
        </div>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={filtered}
            margin={{ top: 8, right: 12, left: 8, bottom: 0 }}
          >
            <CartesianGrid stroke="#27272a" vertical={false} />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              ticks={ticks}
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickFormatter={(value) =>
                formatCalendarTick(Number(value), "weekly", range)
              }
            />
            <YAxis
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickFormatter={compactUsd}
              width={60}
            />
            <Tooltip
              contentStyle={{
                background: "#09090b",
                border: "1px solid #27272a",
                borderRadius: 10,
              }}
              labelStyle={{ color: "#d4d4d8" }}
              labelFormatter={(value) =>
                formatExactPeriod(Number(value), "weekly")
              }
              formatter={(value) => [
                compactUsd(Number(value)),
                mode === "weekly" ? "Weekend gross" : "Four-week gross",
              ]}
            />
            <Line
              type="linear"
              dataKey={dataKey}
              connectNulls={false}
              stroke="#60a5fa"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs leading-5 text-zinc-600">
        Nominal USD. Weekly results are volatile; the rolling view sums four
        consecutive published weekends without interpolation.
      </p>
    </div>
  );
}
