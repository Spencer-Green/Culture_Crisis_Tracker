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

import type { BroadwayChartPoint } from "@/services/theatre/broadway-analytics";
import {
  calendarTicks,
  chartTimestamp,
  filterChartRange,
  formatCalendarTick,
  formatExactPeriod,
} from "@/lib/chart-axis";

type Metric = "gross" | "attendance" | "shows" | "capacity" | "ticket";
type Range = "13W" | "1Y" | "5Y" | "2019" | "MAX";

const METRICS: Record<
  Metric,
  { key: keyof BroadwayChartPoint; label: string }
> = {
  gross: { key: "grossUsd", label: "Gross" },
  attendance: { key: "attendance", label: "Attendance" },
  shows: { key: "showCount", label: "Shows" },
  capacity: { key: "capacityPct", label: "Capacity" },
  ticket: { key: "averageTicketPriceUsd", label: "Avg ticket" },
};

function tick(value: number, metric: Metric): string {
  if (metric === "gross") return `$${(value / 1_000_000).toFixed(0)}M`;
  if (metric === "capacity") return `${value.toFixed(0)}%`;
  if (metric === "ticket") return `$${value.toFixed(0)}`;
  return value.toLocaleString("en-US", { notation: "compact" });
}

export function BroadwayMarketChart({ data }: { data: BroadwayChartPoint[] }) {
  const [metric, setMetric] = useState<Metric>("gross");
  const [range, setRange] = useState<Range>("1Y");
  const [rolling, setRolling] = useState(true);
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
  const key =
    rolling && metric === "gross"
      ? "rolling4GrossUsd"
      : rolling && metric === "attendance"
        ? "rolling4Attendance"
        : METRICS[metric].key;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="inline-flex flex-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-1">
          {(Object.keys(METRICS) as Metric[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMetric(value)}
              className={`rounded-md px-3 py-1.5 text-xs ${metric === value ? "bg-blue-600 text-white" : "text-zinc-500"}`}
            >
              {METRICS[value].label}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-950 p-1">
          {(["13W", "1Y", "5Y", "2019", "MAX"] as const).map((value) => (
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
        {(metric === "gross" || metric === "attendance") && (
          <button
            type="button"
            onClick={() => setRolling((value) => !value)}
            className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400"
          >
            {rolling ? "4-week rolling" : "Weekly"}
          </button>
        )}
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={filtered} margin={{ top: 8, right: 12, left: 8 }}>
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
              tickFormatter={(value) => tick(Number(value), metric)}
              width={64}
            />
            <Tooltip
              contentStyle={{
                background: "#09090b",
                border: "1px solid #27272a",
                borderRadius: 10,
              }}
              labelFormatter={(value) =>
                formatExactPeriod(Number(value), "weekly")
              }
              formatter={(value) => [
                tick(Number(value), metric),
                METRICS[metric].label,
              ]}
            />
            <Line
              type="linear"
              dataKey={key}
              connectNulls={false}
              stroke="#a78bfa"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs leading-5 text-zinc-600">
        Broadway NYC only. Gross is nominal USD; attendance and ticket-price
        context should be read alongside revenue. Missing weeks are not
        interpolated.
      </p>
    </div>
  );
}
