"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  calendarTicks,
  chartTimestamp,
  formatCalendarTick,
  formatExactPeriod,
} from "@/lib/chart-axis";

export function GamingReleaseChart({
  monthly,
  quarterly,
}: {
  monthly: { period: string; count: number }[];
  quarterly: { period: string; count: number }[];
}) {
  const [granularity, setGranularity] = useState<"monthly" | "quarterly">(
    "quarterly",
  );
  const data = granularity === "monthly" ? monthly : quarterly;
  const frequency = granularity === "monthly" ? "monthly" : "quarterly";
  const chartData = useMemo(
    () =>
      data.map((point) => ({
        ...point,
        timestamp: chartTimestamp(point.period, frequency),
      })),
    [data, frequency],
  );
  const ticks = calendarTicks(
    chartData.map((point) => point.timestamp),
    { frequency, range: "MAX" },
  );
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-950 p-1">
        {(["monthly", "quarterly"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setGranularity(value)}
            className={`rounded-md px-3 py-1.5 text-xs capitalize ${granularity === value ? "bg-blue-600 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            {value}
          </button>
        ))}
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
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
                formatCalendarTick(Number(value), frequency, "MAX")
              }
            />
            <YAxis
              tick={{ fill: "#71717a", fontSize: 11 }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: "#09090b",
                border: "1px solid #27272a",
                borderRadius: 10,
              }}
              labelStyle={{ color: "#d4d4d8" }}
              labelFormatter={(value) =>
                formatExactPeriod(Number(value), frequency)
              }
              formatter={(value) => [
                Number(value).toLocaleString(),
                "Tracked releases",
              ]}
            />
            {granularity === "quarterly" ? (
              <Bar dataKey="count" fill="#60a5fa" radius={[3, 3, 0, 0]} />
            ) : (
              <Line
                type="linear"
                dataKey="count"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs leading-5 text-zinc-600">
        Historical counts include completed periods only. The current partial
        month or quarter and future-dated releases remain in the Upcoming Supply
        panel, not the historical series.
      </p>
    </div>
  );
}
