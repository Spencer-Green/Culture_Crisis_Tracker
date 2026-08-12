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
  type TooltipContentProps,
} from "recharts";

import {
  formatCreditIncomeRatio,
  formatUsdPerPerson,
} from "@/lib/normalized-credit";
import { formatMillions } from "@/lib/source-value-format";

export type CreditHistoryView = {
  id: string;
  label: string;
  unit: "usd-millions" | "usd-per-person" | "percent";
  points: { periodStart: string; value: number }[];
};

type Range = "5Y" | "10Y" | "20Y" | "Max";

function formatValue(value: number, unit: CreditHistoryView["unit"]): string {
  if (unit === "usd-millions") return formatMillions(value, "USD");
  if (unit === "usd-per-person") return formatUsdPerPerson(value);
  return formatCreditIncomeRatio(value);
}

function axisValue(value: number, unit: CreditHistoryView["unit"]): string {
  if (unit === "percent") return `${value.toFixed(0)}%`;
  if (unit === "usd-per-person") {
    return `$${new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value)}`;
  }
  return formatMillions(value, "USD");
}

function CreditTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as
    | { periodStart: string; value: number; unit: CreditHistoryView["unit"] }
    | undefined;
  if (!point) return null;

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-950/95 p-3 shadow-2xl">
      <p className="text-xs text-zinc-500">
        {new Intl.DateTimeFormat("en-US", {
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(point.periodStart))}
      </p>
      <p className="font-data mt-1 text-sm text-zinc-100">
        {formatValue(point.value, point.unit)}
      </p>
    </div>
  );
}

export function CreditHistoryChart({ views }: { views: CreditHistoryView[] }) {
  const [activeViewId, setActiveViewId] = useState(views[0]?.id ?? "");
  const [range, setRange] = useState<Range>("20Y");
  const activeView = views.find((view) => view.id === activeViewId) ?? views[0];
  const data = useMemo(() => {
    if (!activeView) return [];
    const points = activeView.points.map((point) => ({
      ...point,
      timestamp: new Date(point.periodStart).getTime(),
      unit: activeView.unit,
    }));
    if (range === "Max" || points.length === 0) return points;
    const years = Number(range.slice(0, -1));
    const cutoff = new Date(points.at(-1)!.periodStart);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
    return points.filter((point) => point.timestamp >= cutoff.getTime());
  }, [activeView, range]);

  if (!activeView || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-zinc-800 text-sm text-zinc-500">
        No aligned historical observations are available.
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
          {views.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => setActiveViewId(view.id)}
              className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                activeView.id === view.id
                  ? "bg-blue-600 text-white"
                  : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              {view.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(["5Y", "10Y", "20Y", "Max"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRange(option)}
              className={`rounded-md px-2 py-1 text-[11px] ${
                range === option
                  ? "bg-zinc-800 text-zinc-200"
                  : "text-zinc-600 hover:text-zinc-300"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div
        className="mt-4 h-72 w-full"
        role="img"
        aria-label={`${activeView.label} consumer credit history`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 14, bottom: 4, left: 0 }}
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
              tickFormatter={(value: number) =>
                new Date(value).getUTCFullYear().toString()
              }
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
              tickFormatter={(value: number) =>
                axisValue(value, activeView.unit)
              }
              width={66}
            />
            <Tooltip
              content={CreditTooltip}
              cursor={{ stroke: "#52525b", strokeDasharray: "3 3" }}
            />
            <Line
              type="linear"
              dataKey="value"
              stroke="#60a5fa"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#60a5fa", stroke: "#09090b" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] text-zinc-600">
        {activeView.label} · {data.length.toLocaleString("en-US")} aligned
        monthly observations
      </p>
    </div>
  );
}
