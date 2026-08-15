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

import type { BeaMusicChartPoint } from "@/services/music/bea-music-analytics";
import {
  calendarTicks,
  chartTimestamp,
  filterChartRange,
  formatCalendarTick,
  formatExactPeriod,
} from "@/lib/chart-axis";

type Mode = "streaming" | "owned" | "indexed";
type Range = "1Y" | "5Y" | "2019" | "MAX";

const MODES: { id: Mode; label: string }[] = [
  { id: "streaming", label: "Streaming / Radio" },
  { id: "owned", label: "Owned Media / Downloads" },
  { id: "indexed", label: "Indexed Comparison" },
];
const RANGES: Range[] = ["1Y", "5Y", "2019", "MAX"];

export function BeaMusicDemandChart({ data }: { data: BeaMusicChartPoint[] }) {
  const [mode, setMode] = useState<Mode>("indexed");
  const [range, setRange] = useState<Range>("2019");
  const visible = useMemo(() => {
    const withTime = data.map((point) => ({
      ...point,
      timestamp: chartTimestamp(point.periodStart, "monthly"),
    }));
    return filterChartRange(withTime, (point) => point.timestamp, range);
  }, [data, range]);
  const ticks = calendarTicks(
    visible.map((point) => point.timestamp),
    { frequency: "monthly", range },
  );
  const indexed = mode === "indexed";
  const dataKey = mode === "streaming" ? "streamingNominal" : "ownedNominal";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {MODES.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                setMode(option.id);
                if (option.id === "indexed") setRange("2019");
              }}
              className={`rounded-full border px-3 py-1.5 text-xs ${mode === option.id ? "border-blue-500 bg-blue-950/60 text-blue-200" : "border-zinc-800 text-zinc-500"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {RANGES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRange(option)}
              className={`rounded-full border px-2.5 py-1.5 text-xs ${range === option ? "border-zinc-600 text-zinc-200" : "border-zinc-800 text-zinc-600"}`}
            >
              {option === "2019"
                ? "Since 2019"
                : option === "MAX"
                  ? "Max"
                  : option}
            </button>
          ))}
        </div>
      </div>
      {indexed ? (
        <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
          <span className="inline-flex items-center gap-2">
            <span className="h-0.5 w-5 bg-blue-400" /> Streaming &amp; radio
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-0.5 w-5 bg-amber-500" /> Owned media &amp;
            downloads
          </span>
        </div>
      ) : null}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={visible} margin={{ top: 8, right: 12, left: 8 }}>
            <CartesianGrid stroke="#27272a" vertical={false} />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              ticks={ticks}
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickFormatter={(value) =>
                formatCalendarTick(Number(value), "monthly", range)
              }
            />
            <YAxis
              width={62}
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickFormatter={(value) =>
                indexed
                  ? Number(value).toFixed(0)
                  : `$${Number(value / 1_000).toFixed(0)}B`
              }
            />
            <Tooltip
              contentStyle={{
                background: "#09090b",
                border: "1px solid #27272a",
                borderRadius: 10,
              }}
              labelFormatter={(value) =>
                formatExactPeriod(Number(value), "monthly")
              }
              formatter={(value, name) => [
                indexed
                  ? `${Number(value).toFixed(1)} (2019 = 100)`
                  : `$${(Number(value) / 1_000).toFixed(2)}B annualized`,
                name === "streamingIndex" || name === "streamingNominal"
                  ? "Streaming and radio services"
                  : "Owned media and downloads",
              ]}
            />
            {indexed ? (
              <>
                <Line
                  type="linear"
                  dataKey="streamingIndex"
                  connectNulls={false}
                  dot={false}
                  stroke="#60a5fa"
                  strokeWidth={2}
                />
                <Line
                  type="linear"
                  dataKey="ownedIndex"
                  connectNulls={false}
                  dot={false}
                  stroke="#f59e0b"
                  strokeWidth={2}
                />
              </>
            ) : (
              <Line
                type="linear"
                dataKey={dataKey}
                connectNulls={false}
                dot={false}
                stroke={mode === "streaming" ? "#60a5fa" : "#f59e0b"}
                strokeWidth={2}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs leading-5 text-zinc-600">
        Monthly BEA levels are seasonally adjusted annual rates. Indexed view
        uses the first valid observation in 2019 as 100; missing months are not
        interpolated.
      </p>
    </div>
  );
}
