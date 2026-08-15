export type ChartFrequency = "weekly" | "monthly" | "quarterly" | "annual";
export type ChartRange = "13W" | "1Y" | "5Y" | "2019" | "MAX";

export function chartTimestamp(
  value: string | number | Date,
  frequency: ChartFrequency,
) {
  if (value instanceof Date) return value.getTime();
  if (frequency === "annual") return Date.UTC(Number(value), 0, 1);
  if (frequency === "quarterly") {
    const match = String(value).match(/^(\d{4})-Q([1-4])$/);
    if (match) return Date.UTC(Number(match[1]), (Number(match[2]) - 1) * 3, 1);
  }
  if (frequency === "monthly") {
    const match = String(value).match(/^(\d{4})-(\d{2})$/);
    if (match) return Date.UTC(Number(match[1]), Number(match[2]) - 1, 1);
  }
  const timestamp = Date.parse(String(value));
  if (!Number.isFinite(timestamp))
    throw new Error(`Invalid chart period: ${value}`);
  return timestamp;
}

export function filterChartRange<T>(
  values: readonly T[],
  getTimestamp: (value: T) => number,
  range: ChartRange,
) {
  if (range === "MAX" || values.length === 0) return [...values];
  const latest = Math.max(...values.map(getTimestamp));
  const start = new Date(latest);
  if (range === "13W") start.setUTCDate(start.getUTCDate() - 13 * 7);
  if (range === "1Y") start.setUTCFullYear(start.getUTCFullYear() - 1);
  if (range === "5Y") start.setUTCFullYear(start.getUTCFullYear() - 5);
  if (range === "2019") start.setTime(Date.UTC(2019, 0, 1));
  return values.filter((value) => getTimestamp(value) >= start.getTime());
}

export function calendarTicks(
  timestamps: readonly number[],
  options: {
    frequency: ChartFrequency;
    range: ChartRange;
    now?: Date;
  },
) {
  const maximum = options.now?.getTime() ?? Number.POSITIVE_INFINITY;
  const sorted = [...new Set(timestamps)]
    .filter((value) => Number.isFinite(value) && value <= maximum)
    .sort((left, right) => left - right);
  const useMonths =
    (options.frequency === "weekly" || options.frequency === "monthly") &&
    (options.range === "13W" || options.range === "1Y");
  const firstByPeriod = new Map<string, number>();
  for (const timestamp of sorted) {
    const date = new Date(timestamp);
    const key = useMonths
      ? `${date.getUTCFullYear()}-${date.getUTCMonth()}`
      : String(date.getUTCFullYear());
    if (!firstByPeriod.has(key)) firstByPeriod.set(key, timestamp);
  }
  const ticks = [...firstByPeriod.values()];
  if (useMonths || ticks.length <= 10) return ticks;
  const stride = Math.ceil(ticks.length / 8);
  return ticks.filter(
    (_, index) => index % stride === 0 || index === ticks.length - 1,
  );
}

export function formatCalendarTick(
  timestamp: number,
  frequency: ChartFrequency,
  range: ChartRange,
) {
  if (
    (frequency === "weekly" || frequency === "monthly") &&
    (range === "13W" || range === "1Y")
  )
    return new Intl.DateTimeFormat("en", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    }).format(timestamp);
  return String(new Date(timestamp).getUTCFullYear());
}

export function formatExactPeriod(
  timestamp: number,
  frequency: ChartFrequency,
) {
  const date = new Date(timestamp);
  if (frequency === "annual") return String(date.getUTCFullYear());
  if (frequency === "quarterly")
    return `${date.getUTCFullYear()} Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
  if (frequency === "monthly")
    return new Intl.DateTimeFormat("en", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
