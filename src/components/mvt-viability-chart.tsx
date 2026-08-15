"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
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

export type MVTChartPoint = {
  year: number;
  venues: number | null;
  closures: number | null;
  unprofitablePct: number | null;
  profitMarginPct: number | null;
  events: number | null;
  employment: number | null;
};

const METRICS = {
  venues: { label: "Venues", colour: "#60a5fa", suffix: "" },
  closures: { label: "Permanent closures", colour: "#f87171", suffix: "" },
  events: { label: "Events", colour: "#34d399", suffix: "" },
  employment: { label: "Employment", colour: "#a78bfa", suffix: "" },
  profitMarginPct: {
    label: "Average profit margin",
    colour: "#fbbf24",
    suffix: "%",
  },
} as const;

type MetricKey = keyof typeof METRICS;

export function MVTViabilityChart({ data }: { data: MVTChartPoint[] }) {
  const [metric, setMetric] = useState<MetricKey>("venues");
  const definition = METRICS[metric];
  const chartData = data.map((point) => ({
    ...point,
    timestamp: chartTimestamp(point.year, "annual"),
  }));
  const ticks = calendarTicks(
    chartData.map((point) => point.timestamp),
    { frequency: "annual", range: "MAX" },
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {Object.entries(METRICS).map(([key, value]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMetric(key as MetricKey)}
            className={`rounded-full border px-3 py-1.5 text-xs ${metric === key ? "border-blue-500 bg-blue-950/60 text-blue-200" : "border-zinc-800 text-zinc-500"}`}
          >
            {value.label}
          </button>
        ))}
      </div>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: 8 }}>
            <CartesianGrid stroke="#27272a" vertical={false} />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              ticks={ticks}
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickFormatter={(value) =>
                formatCalendarTick(Number(value), "annual", "MAX")
              }
            />
            <YAxis
              width={58}
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickFormatter={(value) =>
                `${Number(value).toLocaleString("en-GB", { notation: "compact" })}${definition.suffix}`
              }
            />
            <Tooltip
              contentStyle={{
                background: "#09090b",
                border: "1px solid #27272a",
                borderRadius: 10,
              }}
              formatter={(value) => [
                `${Number(value).toLocaleString("en-GB")}${definition.suffix}`,
                definition.label,
              ]}
              labelFormatter={(value) =>
                formatExactPeriod(Number(value), "annual")
              }
            />
            <Line
              type="linear"
              dataKey={metric}
              connectNulls={false}
              stroke={definition.colour}
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs leading-5 text-zinc-600">
        Annual MVT survey snapshots. Definitions and respondent coverage can
        change between reports; missing values are not interpolated.
      </p>
    </div>
  );
}
