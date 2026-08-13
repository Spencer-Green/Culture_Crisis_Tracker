"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type TicketmasterTheatreTrendPoint = {
  capturedAt: string;
  events30: number | null;
  events90: number | null;
};

export function TicketmasterTheatreTrendChart({
  data,
}: {
  data: TicketmasterTheatreTrendPoint[];
}) {
  return (
    <div className="space-y-3">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 8 }}>
            <CartesianGrid stroke="#27272a" vertical={false} />
            <XAxis
              dataKey="capturedAt"
              tick={{ fill: "#71717a", fontSize: 11 }}
            />
            <YAxis
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickFormatter={(value) =>
                Number(value).toLocaleString("en", { notation: "compact" })
              }
              width={52}
            />
            <Tooltip
              contentStyle={{
                background: "#09090b",
                border: "1px solid #27272a",
                borderRadius: 10,
              }}
              formatter={(value, name) => [
                Number(value).toLocaleString(),
                name === "events30" ? "30D events" : "90D events",
              ]}
            />
            <Line
              type="linear"
              dataKey="events30"
              connectNulls={false}
              stroke="#34d399"
              strokeWidth={2}
            />
            <Line
              type="linear"
              dataKey="events90"
              connectNulls={false}
              stroke="#60a5fa"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs leading-5 text-zinc-600">
        Equivalent country and Arts &amp; Theatre snapshots only. Forward
        listings are supply evidence, not realized demand or a complete theatre
        census.
      </p>
    </div>
  );
}
