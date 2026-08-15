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
import {
  calendarTicks,
  chartTimestamp,
  formatCalendarTick,
  formatExactPeriod,
} from "@/lib/chart-axis";

export type TicketmasterMusicTrendPoint = {
  capturedAt: string;
  events30: number | null;
  events90: number | null;
};

export function TicketmasterMusicTrendChart({
  data,
}: {
  data: TicketmasterMusicTrendPoint[];
}) {
  const chartData = data.map((point) => ({
    ...point,
    timestamp: chartTimestamp(point.capturedAt, "weekly"),
  }));
  const ticks = calendarTicks(
    chartData.map((point) => point.timestamp),
    { frequency: "weekly", range: "1Y" },
  );
  return (
    <div className="space-y-3">
      <div className="h-56">
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
                formatCalendarTick(Number(value), "weekly", "1Y")
              }
            />
            <YAxis
              width={52}
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickFormatter={(value) =>
                Number(value).toLocaleString("en", { notation: "compact" })
              }
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
              labelFormatter={(value) =>
                formatExactPeriod(Number(value), "weekly")
              }
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
        Equivalent country and Music snapshots only. Ticketmaster coverage is
        forward supply evidence, not the complete live-music market.
      </p>
    </div>
  );
}
