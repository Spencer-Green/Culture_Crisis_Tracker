import type { ConsumerSpendingObservation } from "@/services/consumer-spending-core";

export type NumericInput = number | string | null | undefined;

export type HistoricalClassification =
  "Low" | "Typical" | "Elevated" | "High" | "Extreme";

export type HistoricalChange = {
  absolute: number;
  percent: number | null;
};

export type HistoricalMetricContext = {
  current: ConsumerSpendingObservation;
  previous: ConsumerSpendingObservation | null;
  yearAgo: ConsumerSpendingObservation | null;
  previousChange: HistoricalChange | null;
  yearOverYearChange: HistoricalChange | null;
  minimum: number;
  maximum: number;
  median: number;
  percentile25: number;
  percentile75: number;
  percentile90: number;
  percentile975: number;
  percentileRank: number;
  classification: HistoricalClassification;
  observationCount: number;
};

function toFiniteNumber(value: NumericInput): number | null {
  if (value === null || value === undefined || value === "" || value === ".") {
    return null;
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function sortedValues(values: readonly NumericInput[]): number[] {
  return values
    .map(toFiniteNumber)
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
}

export function minimum(values: readonly NumericInput[]): number | null {
  return sortedValues(values)[0] ?? null;
}

export function maximum(values: readonly NumericInput[]): number | null {
  return sortedValues(values).at(-1) ?? null;
}

/**
 * Uses linear interpolation between adjacent ordered values at
 * index (n - 1) × p, equivalent to the common R-7 / Excel PERCENTILE.INC method.
 */
export function percentile(
  values: readonly NumericInput[],
  percentileValue: number,
): number | null {
  if (percentileValue < 0 || percentileValue > 100) {
    throw new RangeError("Percentile must be between 0 and 100.");
  }
  const sorted = sortedValues(values);
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];

  const position = (sorted.length - 1) * (percentileValue / 100);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const weight = position - lowerIndex;

  return (
    sorted[lowerIndex] + (sorted[upperIndex] - sorted[lowerIndex]) * weight
  );
}

export function median(values: readonly NumericInput[]): number | null {
  return percentile(values, 50);
}

/**
 * Uses an empirical midrank: values below the target plus half the values equal
 * to it, divided by the valid observation count.
 */
export function percentileRank(
  values: readonly NumericInput[],
  target: number,
): number | null {
  const validValues = sortedValues(values);
  if (validValues.length === 0 || !Number.isFinite(target)) return null;

  const below = validValues.filter((value) => value < target).length;
  const equal = validValues.filter((value) => value === target).length;
  return ((below + equal / 2) / validValues.length) * 100;
}

export function classifyHistoricalPercentile(
  rank: number,
): HistoricalClassification {
  if (rank < 25) return "Low";
  if (rank < 75) return "Typical";
  if (rank < 90) return "Elevated";
  if (rank < 97.5) return "High";
  return "Extreme";
}

export function previousPeriodChange(
  current: NumericInput,
  previous: NumericInput,
): HistoricalChange | null {
  const currentValue = toFiniteNumber(current);
  const previousValue = toFiniteNumber(previous);
  if (currentValue === null || previousValue === null) return null;

  return {
    absolute: currentValue - previousValue,
    percent:
      previousValue === 0
        ? null
        : ((currentValue - previousValue) / previousValue) * 100,
  };
}

export function yearOverYearChange(
  current: NumericInput,
  yearAgo: NumericInput,
): HistoricalChange | null {
  return previousPeriodChange(current, yearAgo);
}

function shiftUtcMonths(value: string, months: number): string {
  const date = new Date(value);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString();
}

export function buildHistoricalMetricContext(
  observations: readonly ConsumerSpendingObservation[],
  metricSlug: string,
  frequency: "monthly" | "quarterly",
): HistoricalMetricContext | null {
  const byPeriod = new Map<string, ConsumerSpendingObservation>();
  for (const observation of observations) {
    if (
      observation.metricSlug === metricSlug &&
      toFiniteNumber(observation.value) !== null
    ) {
      byPeriod.set(observation.periodStart, observation);
    }
  }
  const series = [...byPeriod.values()].sort(
    (left, right) =>
      new Date(left.periodStart).getTime() -
      new Date(right.periodStart).getTime(),
  );
  const current = series.at(-1);
  if (!current) return null;

  const periodMonths = frequency === "monthly" ? 1 : 3;
  const previous =
    byPeriod.get(shiftUtcMonths(current.periodStart, periodMonths)) ?? null;
  const yearAgo = byPeriod.get(shiftUtcMonths(current.periodStart, 12)) ?? null;
  const values = series.map((observation) => observation.value);
  const currentValue = Number(current.value);
  const rank = percentileRank(values, currentValue);
  const statistics = {
    minimum: minimum(values),
    maximum: maximum(values),
    median: median(values),
    percentile25: percentile(values, 25),
    percentile75: percentile(values, 75),
    percentile90: percentile(values, 90),
    percentile975: percentile(values, 97.5),
  };
  if (
    rank === null ||
    Object.values(statistics).some((value) => value === null)
  ) {
    return null;
  }

  return {
    current,
    previous,
    yearAgo,
    previousChange: previousPeriodChange(current.value, previous?.value),
    yearOverYearChange: yearOverYearChange(current.value, yearAgo?.value),
    minimum: statistics.minimum as number,
    maximum: statistics.maximum as number,
    median: statistics.median as number,
    percentile25: statistics.percentile25 as number,
    percentile75: statistics.percentile75 as number,
    percentile90: statistics.percentile90 as number,
    percentile975: statistics.percentile975 as number,
    percentileRank: rank,
    classification: classifyHistoricalPercentile(rank),
    observationCount: series.length,
  };
}
