import type { ConsumerSpendingObservation } from "@/services/consumer-spending-core";

export const CONSUMER_DEMAND_BASELINE = "2019-01-01T00:00:00.000Z";

export type DemandBasis = "nominal" | "real";

export type DemandSeriesDefinition = {
  id: "australia" | "united-kingdom" | "united-states" | "canada";
  country: string;
  source: "ABS" | "ONS" | "BEA" | "Statistics Canada";
  metricSlug?: string;
  basis: DemandBasis;
  color: string;
  annualized: boolean;
  unavailableReason?: string;
};

export type IndexedDemandPoint = {
  seriesId: DemandSeriesDefinition["id"];
  country: string;
  source: DemandSeriesDefinition["source"];
  periodStart: string;
  originalPeriod: string;
  frequency: string;
  indexedValue: number;
  originalValue: string;
  unit: string;
  basis: DemandBasis;
  annualized: boolean;
};

export type IndexedDemandSeries = DemandSeriesDefinition & {
  baselinePeriod: string | null;
  points: IndexedDemandPoint[];
};

export type MixedFrequencyChartDatum = {
  timestamp: number;
  periodStart: string;
  values: Partial<Record<DemandSeriesDefinition["id"], number>>;
  points: Partial<Record<DemandSeriesDefinition["id"], IndexedDemandPoint>>;
};

const NOMINAL_DEFINITIONS = [
  {
    id: "australia",
    country: "Australia",
    source: "ABS",
    metricSlug: "au-recreation-culture-spending-current-price-sa",
    basis: "nominal",
    color: "#38bdf8",
    annualized: false,
  },
  {
    id: "united-kingdom",
    country: "United Kingdom",
    source: "ONS",
    metricSlug: "uk-recreation-culture-spending-current-price-sa",
    basis: "nominal",
    color: "#a78bfa",
    annualized: false,
  },
  {
    id: "united-states",
    country: "United States",
    source: "BEA",
    metricSlug: "us-recreation-services-pce-current-price",
    basis: "nominal",
    color: "#34d399",
    annualized: true,
  },
  {
    id: "canada",
    country: "Canada",
    source: "Statistics Canada",
    metricSlug: "ca-recreation-culture-spending-current-price",
    basis: "nominal",
    color: "#fb7185",
    annualized: false,
  },
] as const satisfies readonly DemandSeriesDefinition[];

const REAL_DEFINITIONS = [
  {
    id: "australia",
    country: "Australia",
    source: "ABS",
    basis: "real",
    color: "#38bdf8",
    annualized: false,
    unavailableReason:
      "No comparable real recreation and culture metric is available in the current ABS integration.",
  },
  {
    id: "united-kingdom",
    country: "United Kingdom",
    source: "ONS",
    metricSlug: "uk-recreation-culture-spending-cvm-sa",
    basis: "real",
    color: "#a78bfa",
    annualized: false,
  },
  {
    id: "united-states",
    country: "United States",
    source: "BEA",
    metricSlug: "us-recreation-services-pce-real",
    basis: "real",
    color: "#34d399",
    annualized: true,
  },
  {
    id: "canada",
    country: "Canada",
    source: "Statistics Canada",
    metricSlug: "ca-recreation-culture-spending-real",
    basis: "real",
    color: "#fb7185",
    annualized: false,
  },
] as const satisfies readonly DemandSeriesDefinition[];

export function formatDemandPeriod(
  periodStart: string,
  frequency: string,
): string {
  const date = new Date(periodStart);
  if (frequency === "quarterly") {
    return `${date.getUTCFullYear()} Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
  }

  if (frequency === "annual") {
    return String(date.getUTCFullYear());
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function normalizeIndexedSeries(
  observations: readonly ConsumerSpendingObservation[],
  definition: DemandSeriesDefinition,
  baselineStart = CONSUMER_DEMAND_BASELINE,
): IndexedDemandSeries {
  if (!definition.metricSlug) {
    return { ...definition, baselinePeriod: null, points: [] };
  }

  const baselineTimestamp = new Date(baselineStart).getTime();
  const validObservations = observations
    .filter((observation) => observation.metricSlug === definition.metricSlug)
    .map((observation) => ({
      observation,
      timestamp: new Date(observation.periodStart).getTime(),
      numericValue: Number(observation.value),
    }))
    .filter(
      ({ timestamp, numericValue }) =>
        Number.isFinite(timestamp) &&
        timestamp >= baselineTimestamp &&
        Number.isFinite(numericValue),
    )
    .sort((left, right) => left.timestamp - right.timestamp);
  const baseline = validObservations.find(
    ({ numericValue }) => numericValue !== 0,
  );

  if (!baseline) {
    return { ...definition, baselinePeriod: null, points: [] };
  }

  const seenPeriods = new Set<string>();
  const points = validObservations
    .filter(({ timestamp }) => timestamp >= baseline.timestamp)
    .flatMap(({ observation, numericValue }): IndexedDemandPoint[] => {
      if (seenPeriods.has(observation.periodStart)) {
        return [];
      }
      seenPeriods.add(observation.periodStart);

      return [
        {
          seriesId: definition.id,
          country: definition.country,
          source: definition.source,
          periodStart: observation.periodStart,
          originalPeriod: formatDemandPeriod(
            observation.periodStart,
            observation.frequency,
          ),
          frequency: observation.frequency,
          indexedValue: Number(
            ((numericValue / baseline.numericValue) * 100).toFixed(4),
          ),
          originalValue: observation.value,
          unit: observation.unit,
          basis: definition.basis,
          annualized: definition.annualized,
        },
      ];
    });

  return {
    ...definition,
    baselinePeriod: baseline.observation.periodStart,
    points,
  };
}

export function buildNominalDemandSeries(
  observations: readonly ConsumerSpendingObservation[],
): IndexedDemandSeries[] {
  return NOMINAL_DEFINITIONS.map((definition) =>
    normalizeIndexedSeries(observations, definition),
  );
}

export function buildRealDemandSeries(
  observations: readonly ConsumerSpendingObservation[],
): IndexedDemandSeries[] {
  return REAL_DEFINITIONS.map((definition) =>
    normalizeIndexedSeries(observations, definition),
  );
}

export function prepareMixedFrequencyChart(
  series: readonly IndexedDemandSeries[],
): MixedFrequencyChartDatum[] {
  const byPeriod = new Map<string, MixedFrequencyChartDatum>();

  for (const item of series) {
    for (const point of item.points) {
      const datum = byPeriod.get(point.periodStart) ?? {
        timestamp: new Date(point.periodStart).getTime(),
        periodStart: point.periodStart,
        values: {},
        points: {},
      };
      datum.values[item.id] = point.indexedValue;
      datum.points[item.id] = point;
      byPeriod.set(point.periodStart, datum);
    }
  }

  return [...byPeriod.values()].sort(
    (left, right) => left.timestamp - right.timestamp,
  );
}
