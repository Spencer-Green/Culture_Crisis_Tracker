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
    const latest = new Date(`${data.at(-1)?.date ?? "1970-01-01"}T00:00:00Z`);
    const start = new Date(latest);
    if (range === "13W") start.setUTCDate(start.getUTCDate() - 13 * 7);
    if (range === "1Y") start.setUTCFullYear(start.getUTCFullYear() - 1);
    if (range === "5Y") start.setUTCFullYear(start.getUTCFullYear() - 5);
    if (range === "2019") start.setTime(Date.parse("2019-01-01T00:00:00Z"));
    return range === "MAX"
      ? data
      : data.filter((point) => new Date(`${point.date}T00:00:00Z`) >= start);
  }, [data, range]);
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
              dataKey="date"
              tick={{ fill: "#71717a", fontSize: 11 }}
              minTickGap={36}
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
              formatter={(value) => [
                tick(Number(value), metric),
                METRICS[metric].label,
              ]}
            />
            <Line
              type="monotone"
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
