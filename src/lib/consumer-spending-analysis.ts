import type { ConsumerSpendingObservation } from "@/services/consumer-spending-core";

export type NativeFrequency = "monthly" | "quarterly";

export type MetricTrend = {
  current: ConsumerSpendingObservation;
  previous: ConsumerSpendingObservation | null;
  yearAgo: ConsumerSpendingObservation | null;
  periodChange: number | null;
  yearOverYearChange: number | null;
};

export type RecreationShareTrend = {
  periodStart: string;
  current: number;
  previous: number | null;
  yearAgo: number | null;
  yearOverYearPointChange: number | null;
};

function finiteValue(observation: ConsumerSpendingObservation | undefined) {
  if (!observation) return null;
  const value = Number(observation.value);
  return Number.isFinite(value) ? value : null;
}

function shiftPeriod(periodStart: string, months: number): string {
  const date = new Date(periodStart);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months, 1),
  ).toISOString();
}

function percentChange(current: number | null, comparison: number | null) {
  if (current === null || comparison === null || comparison === 0) return null;
  return ((current - comparison) / comparison) * 100;
}

function metricSeries(
  observations: readonly ConsumerSpendingObservation[],
  metricSlug: string,
) {
  const byPeriod = new Map<string, ConsumerSpendingObservation>();
  for (const observation of observations) {
    if (observation.metricSlug !== metricSlug) continue;
    if (finiteValue(observation) === null) continue;
    byPeriod.set(observation.periodStart, observation);
  }
  return byPeriod;
}

export function buildMetricTrend(
  observations: readonly ConsumerSpendingObservation[],
  metricSlug: string,
  frequency: NativeFrequency,
): MetricTrend | null {
  const byPeriod = metricSeries(observations, metricSlug);
  const current = [...byPeriod.values()]
    .sort(
      (left, right) =>
        new Date(left.periodStart).getTime() -
        new Date(right.periodStart).getTime(),
    )
    .at(-1);
  if (!current) return null;

  const previous =
    byPeriod.get(
      shiftPeriod(current.periodStart, frequency === "monthly" ? 1 : 3),
    ) ?? null;
  const yearAgo = byPeriod.get(shiftPeriod(current.periodStart, 12)) ?? null;
  return {
    current,
    previous,
    yearAgo,
    periodChange: percentChange(
      finiteValue(current),
      finiteValue(previous ?? undefined),
    ),
    yearOverYearChange: percentChange(
      finiteValue(current),
      finiteValue(yearAgo ?? undefined),
    ),
  };
}

export function buildRecreationShareTrend(
  observations: readonly ConsumerSpendingObservation[],
  recreationMetricSlug: string,
  totalMetricSlug: string,
  frequency: NativeFrequency,
): RecreationShareTrend | null {
  const recreationByPeriod = metricSeries(observations, recreationMetricSlug);
  const totalByPeriod = metricSeries(observations, totalMetricSlug);
  const alignedPeriods = [...recreationByPeriod.keys()]
    .filter((period) => totalByPeriod.has(period))
    .sort(
      (left, right) => new Date(left).getTime() - new Date(right).getTime(),
    );
  const periodStart = alignedPeriods.at(-1);
  if (!periodStart) return null;

  const shareAt = (period: string): number | null => {
    const recreation = finiteValue(recreationByPeriod.get(period));
    const total = finiteValue(totalByPeriod.get(period));
    if (recreation === null || total === null || total === 0) return null;
    return (recreation / total) * 100;
  };
  const current = shareAt(periodStart);
  if (current === null) return null;
  const previous = shareAt(
    shiftPeriod(periodStart, frequency === "monthly" ? 1 : 3),
  );
  const yearAgo = shareAt(shiftPeriod(periodStart, 12));

  return {
    periodStart,
    current,
    previous,
    yearAgo,
    yearOverYearPointChange: yearAgo === null ? null : current - yearAgo,
  };
}

export function nominalRealGrowthGap(
  nominalGrowth: number | null,
  realGrowth: number | null,
): number | null {
  if (nominalGrowth === null || realGrowth === null) return null;
  return nominalGrowth - realGrowth;
}

export function alignedNominalRealGrowthGap(
  nominal: MetricTrend | null,
  real: MetricTrend | null,
): number | null {
  if (
    !nominal ||
    !real ||
    nominal.current.periodStart !== real.current.periodStart
  ) {
    return null;
  }
  return nominalRealGrowthGap(
    nominal.yearOverYearChange,
    real.yearOverYearChange,
  );
}

export function latestPeriodComparison<T extends { periodStart: string }>(
  values: readonly T[],
): T | null {
  return (
    [...values]
      .sort(
        (left, right) =>
          new Date(left.periodStart).getTime() -
          new Date(right.periodStart).getTime(),
      )
      .at(-1) ?? null
  );
}
