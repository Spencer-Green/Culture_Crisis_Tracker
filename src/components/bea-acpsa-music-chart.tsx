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

export type BEAACPSAChartPoint = {
  year: number;
  outputUsd: number | null;
  valueAddedUsd: number | null;
  employment: number | null;
  compensationUsd: number | null;
  outputIndex1998: number | null;
  employmentIndex1998: number | null;
  outputIndex2019: number | null;
  employmentIndex2019: number | null;
};

type Mode =
  "output" | "value-added" | "employment" | "compensation" | "indexed";

const MODES: Array<{ id: Mode; label: string }> = [
  { id: "output", label: "Output" },
  { id: "value-added", label: "Value Added" },
  { id: "employment", label: "Employment" },
  { id: "compensation", label: "Compensation" },
  { id: "indexed", label: "Output vs Employment — Indexed" },
];

export function BEAACPSAMusicChart({ data }: { data: BEAACPSAChartPoint[] }) {
  const [mode, setMode] = useState<Mode>("indexed");
  const [baseline, setBaseline] = useState<"1998" | "2019">("2019");
  const indexed = mode === "indexed";
  const outputIndexKey =
    baseline === "1998" ? "outputIndex1998" : "outputIndex2019";
  const employmentIndexKey =
    baseline === "1998" ? "employmentIndex1998" : "employmentIndex2019";
  const key =
    mode === "output"
      ? "outputUsd"
      : mode === "value-added"
        ? "valueAddedUsd"
        : mode === "employment"
          ? "employment"
          : "compensationUsd";
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
        {MODES.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setMode(option.id)}
            className={`rounded-full border px-3 py-1.5 text-xs ${mode === option.id ? "border-amber-500 bg-amber-950/60 text-amber-200" : "border-zinc-800 text-zinc-500"}`}
          >
            {option.label}
          </button>
        ))}
        {indexed ? (
          <div className="ml-auto flex gap-2">
            {(["1998", "2019"] as const).map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => setBaseline(year)}
                className={`rounded-full border px-3 py-1.5 text-xs ${baseline === year ? "border-zinc-600 text-zinc-200" : "border-zinc-800 text-zinc-600"}`}
              >
                {year} = 100
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="h-72">
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
              width={68}
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickFormatter={(value) =>
                indexed
                  ? Number(value).toFixed(0)
                  : mode === "employment"
                    ? Number(value).toLocaleString("en-US", {
                        notation: "compact",
                      })
                    : `$${Number(value / 1_000_000_000).toFixed(0)}B`
              }
            />
            <Tooltip
              contentStyle={{
                background: "#09090b",
                border: "1px solid #27272a",
                borderRadius: 10,
              }}
              formatter={(value, name) => [
                indexed
                  ? `${Number(value).toFixed(1)} (${baseline} = 100)`
                  : mode === "employment"
                    ? Number(value).toLocaleString("en-US")
                    : `$${(Number(value) / 1_000_000_000).toFixed(2)}B`,
                name === outputIndexKey
                  ? "ACPSA output"
                  : name === employmentIndexKey
                    ? "ACPSA employment"
                    : MODES.find((option) => option.id === mode)?.label,
              ]}
              labelFormatter={(value) =>
                formatExactPeriod(Number(value), "annual")
              }
            />
            {indexed ? (
              <>
                <Line
                  type="linear"
                  dataKey={outputIndexKey}
                  connectNulls={false}
                  dot={false}
                  stroke="#f59e0b"
                  strokeWidth={2}
                />
                <Line
                  type="linear"
                  dataKey={employmentIndexKey}
                  connectNulls={false}
                  dot={false}
                  stroke="#60a5fa"
                  strokeWidth={2}
                />
              </>
            ) : (
              <Line
                type="linear"
                dataKey={key}
                connectNulls={false}
                dot={false}
                stroke="#f59e0b"
                strokeWidth={2}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs leading-5 text-zinc-600">
        Annual BEA ACPSA observations, 1998–2023. Dollar series are nominal;
        indexed output versus employment supports 1998 or 2019 = 100. Missing
        years are not interpolated.
      </p>
    </div>
  );
}
