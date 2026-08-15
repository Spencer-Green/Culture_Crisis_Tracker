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

import type { LPAPerformanceChartPoint } from "@/services/theatre/lpa-analytics";
import {
  calendarTicks,
  chartTimestamp,
  formatCalendarTick,
  formatExactPeriod,
} from "@/lib/chart-axis";

type Category = "theatre" | "musicalTheatre" | "combined";
type Metric = "revenueAud" | "attendance" | "averageTicketPriceAud";
type Range = "2019" | "MAX";

const CATEGORIES: Record<Category, string> = {
  theatre: "Theatre",
  musicalTheatre: "Musical Theatre",
  combined: "Combined",
};

const METRICS: Record<Metric, string> = {
  revenueAud: "Revenue",
  attendance: "Attendance",
  averageTicketPriceAud: "Average ticket",
};

function formatValue(value: number, metric: Metric) {
  if (metric === "revenueAud") return `A$${(value / 1_000_000).toFixed(1)}M`;
  if (metric === "averageTicketPriceAud") return `A$${value.toFixed(2)}`;
  return value.toLocaleString("en-AU", { notation: "compact" });
}

export function LPAPerformanceChart({
  data,
}: {
  data: Record<Category, LPAPerformanceChartPoint[]>;
}) {
  const [category, setCategory] = useState<Category>("theatre");
  const [metric, setMetric] = useState<Metric>("revenueAud");
  const [range, setRange] = useState<Range>("2019");
  const selected = useMemo(
    () =>
      data[category]
        .filter((point) => range === "MAX" || point.year >= 2019)
        .map((point) => ({
          ...point,
          timestamp: chartTimestamp(point.year, "annual"),
        })),
    [category, data, range],
  );
  const ticks = calendarTicks(
    selected.map((point) => point.timestamp),
    { frequency: "annual", range: range === "2019" ? "2019" : "MAX" },
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="inline-flex flex-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-1">
          {(Object.keys(CATEGORIES) as Category[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setCategory(value);
                if (value === "combined" && metric === "averageTicketPriceAud")
                  setMetric("revenueAud");
              }}
              className={`rounded-md px-3 py-1.5 text-xs ${category === value ? "bg-blue-600 text-white" : "text-zinc-500"}`}
            >
              {CATEGORIES[value]}
            </button>
          ))}
        </div>
        <div className="inline-flex flex-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-1">
          {(Object.keys(METRICS) as Metric[]).map((value) => (
            <button
              key={value}
              type="button"
              disabled={
                category === "combined" && value === "averageTicketPriceAud"
              }
              onClick={() => setMetric(value)}
              className={`rounded-md px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:text-zinc-800 ${metric === value ? "bg-violet-600 text-white" : "text-zinc-500"}`}
            >
              {METRICS[value]}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-950 p-1">
          {(["2019", "MAX"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRange(value)}
              className={`rounded-md px-3 py-1.5 text-xs ${range === value ? "bg-zinc-700 text-white" : "text-zinc-500"}`}
            >
              {value === "2019" ? "Since 2019" : "Max"}
            </button>
          ))}
        </div>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={selected} margin={{ top: 8, right: 12, left: 8 }}>
            <CartesianGrid stroke="#27272a" vertical={false} />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              ticks={ticks}
              allowDecimals={false}
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickFormatter={(value) =>
                formatCalendarTick(
                  Number(value),
                  "annual",
                  range === "2019" ? "2019" : "MAX",
                )
              }
            />
            <YAxis
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickFormatter={(value) => formatValue(Number(value), metric)}
              width={72}
            />
            <Tooltip
              contentStyle={{
                background: "#09090b",
                border: "1px solid #27272a",
                borderRadius: 10,
              }}
              labelFormatter={(value) =>
                formatExactPeriod(Number(value), "annual")
              }
              formatter={(value) => [
                formatValue(Number(value), metric),
                METRICS[metric],
              ]}
            />
            <Line
              type="linear"
              dataKey={metric}
              connectNulls={false}
              stroke="#c084fc"
              strokeWidth={2}
              dot={{ r: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs leading-5 text-zinc-600">
        Annual national observations. Revenue is nominal AUD; missing years and
        values are not interpolated. Combined revenue and attendance are
        tracker-calculated sums of mutually exclusive source categories.
      </p>
    </div>
  );
}
