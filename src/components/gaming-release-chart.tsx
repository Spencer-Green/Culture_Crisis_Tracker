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
          <LineChart
            data={data}
            margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
          >
            <CartesianGrid stroke="#27272a" vertical={false} />
            <XAxis
              dataKey="period"
              tick={{ fill: "#71717a", fontSize: 11 }}
              minTickGap={28}
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
              formatter={(value) => [
                Number(value).toLocaleString(),
                "Tracked releases",
              ]}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke="#60a5fa"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
