import {
  BEA_MUSIC_METRICS,
  type BeaMetricSlug,
} from "@/data-sources/macro/bea-metrics";
import { buildMetricTrend } from "@/lib/consumer-spending-analysis";
import type { ConsumerSpendingObservation } from "@/services/consumer-spending-core";

export const BEA_MUSIC_SLUGS = {
  streamingNominal: "us-audio-streaming-radio-pce-current-price",
  streamingReal: "us-audio-streaming-radio-pce-real",
  ownedNominal: "us-owned-recorded-music-pce-current-price",
  ownedReal: "us-owned-recorded-music-pce-real",
} as const satisfies Record<string, BeaMetricSlug>;

export type BeaMusicChartPoint = {
  periodStart: string;
  streamingNominal: number | null;
  ownedNominal: number | null;
  streamingIndex: number | null;
  ownedIndex: number | null;
};

function numericSeries(
  observations: readonly ConsumerSpendingObservation[],
  metricSlug: string,
) {
  return observations
    .filter((observation) => observation.metricSlug === metricSlug)
    .map((observation) => ({
      periodStart: observation.periodStart,
      value: Number(observation.value),
    }))
    .filter((observation) => Number.isFinite(observation.value))
    .sort((left, right) => left.periodStart.localeCompare(right.periodStart));
}

function indexSeries(
  series: readonly { periodStart: string; value: number }[],
  baselinePeriod = "2019-01-01T00:00:00.000Z",
) {
  const baseline = series.find(
    (observation) =>
      observation.periodStart >= baselinePeriod && observation.value !== 0,
  );
  if (!baseline) return new Map<string, number>();
  return new Map(
    series
      .filter((observation) => observation.periodStart >= baseline.periodStart)
      .map((observation) => [
        observation.periodStart,
        (observation.value / baseline.value) * 100,
      ]),
  );
}

export function buildBeaMusicAnalytics(
  observations: readonly ConsumerSpendingObservation[],
) {
  const streamingNominalTrend = buildMetricTrend(
    observations,
    BEA_MUSIC_SLUGS.streamingNominal,
    "monthly",
  );
  const streamingRealTrend = buildMetricTrend(
    observations,
    BEA_MUSIC_SLUGS.streamingReal,
    "monthly",
  );
  const ownedNominalTrend = buildMetricTrend(
    observations,
    BEA_MUSIC_SLUGS.ownedNominal,
    "monthly",
  );
  const ownedRealTrend = buildMetricTrend(
    observations,
    BEA_MUSIC_SLUGS.ownedReal,
    "monthly",
  );
  const streamingNominal = numericSeries(
    observations,
    BEA_MUSIC_SLUGS.streamingNominal,
  );
  const ownedNominal = numericSeries(
    observations,
    BEA_MUSIC_SLUGS.ownedNominal,
  );
  const streamingIndex = indexSeries(streamingNominal);
  const ownedIndex = indexSeries(ownedNominal);
  const periods = new Set([
    ...streamingNominal.map((observation) => observation.periodStart),
    ...ownedNominal.map((observation) => observation.periodStart),
  ]);
  const streamingByPeriod = new Map(
    streamingNominal.map((observation) => [
      observation.periodStart,
      observation.value,
    ]),
  );
  const ownedByPeriod = new Map(
    ownedNominal.map((observation) => [
      observation.periodStart,
      observation.value,
    ]),
  );
  const chart: BeaMusicChartPoint[] = [...periods]
    .sort()
    .map((periodStart) => ({
      periodStart,
      streamingNominal: streamingByPeriod.get(periodStart) ?? null,
      ownedNominal: ownedByPeriod.get(periodStart) ?? null,
      streamingIndex: streamingIndex.get(periodStart) ?? null,
      ownedIndex: ownedIndex.get(periodStart) ?? null,
    }));

  const alignedNominalPeriods = [...streamingByPeriod.keys()]
    .filter((period) => ownedByPeriod.has(period))
    .sort();
  const sharePeriod = alignedNominalPeriods.at(-1) ?? null;
  const streamingValue = sharePeriod
    ? (streamingByPeriod.get(sharePeriod) ?? null)
    : null;
  const ownedValue = sharePeriod
    ? (ownedByPeriod.get(sharePeriod) ?? null)
    : null;
  const combined =
    streamingValue === null || ownedValue === null
      ? null
      : streamingValue + ownedValue;

  return {
    metricDefinitions: BEA_MUSIC_METRICS,
    streamingNominal: streamingNominalTrend,
    streamingReal: streamingRealTrend,
    ownedNominal: ownedNominalTrend,
    ownedReal: ownedRealTrend,
    nominalRealGrowthGap: {
      streaming:
        streamingNominalTrend?.yearOverYearChange != null &&
        streamingRealTrend?.yearOverYearChange != null
          ? streamingNominalTrend.yearOverYearChange -
            streamingRealTrend.yearOverYearChange
          : null,
      owned:
        ownedNominalTrend?.yearOverYearChange != null &&
        ownedRealTrend?.yearOverYearChange != null
          ? ownedNominalTrend.yearOverYearChange -
            ownedRealTrend.yearOverYearChange
          : null,
    },
    share:
      sharePeriod && combined !== null && combined !== 0
        ? {
            periodStart: sharePeriod,
            streamingPct: (streamingValue! / combined) * 100,
            ownedPct: (ownedValue! / combined) * 100,
          }
        : null,
    chart,
  };
}
