import {
  maximum,
  median,
  minimum,
  percentile,
  percentileRank,
  yearOverYearChange,
  type HistoricalChange,
} from "@/lib/historical-statistics";
import type { ConsumerSpendingObservation } from "@/services/consumer-spending-core";

export const NORMALIZED_CREDIT_METRICS = {
  totalCredit: "us-total-consumer-credit-sa",
  revolvingCredit: "us-revolving-consumer-credit-sa",
  cpi: "us-cpi-all-urban-consumers-sa",
  population: "us-population-monthly",
  disposableIncome: "us-disposable-personal-income-saar",
} as const;

export type MonthlyNumericPoint = {
  periodStart: string;
  value: number;
};

export type AlignedMonthlyPoint = {
  periodStart: string;
  numerator: number;
  denominator: number;
};

export type DerivedCreditPoint = MonthlyNumericPoint & {
  numerator: number;
  denominator: number;
};

export type DerivedHistoricalContext = {
  points: DerivedCreditPoint[];
  current: DerivedCreditPoint;
  yearAgo: DerivedCreditPoint | null;
  yearOverYearChange: HistoricalChange | null;
  minimum: number;
  maximum: number;
  median: number;
  percentile75: number;
  percentile90: number;
  percentileRank: number;
};

export type NormalizedCreditAnalytics = {
  cpiReference: {
    periodStart: string;
    value: number;
  } | null;
  totalReal: DerivedHistoricalContext | null;
  totalPerCapita: DerivedHistoricalContext | null;
  totalToDisposableIncome: DerivedHistoricalContext | null;
  revolvingPerCapita: DerivedHistoricalContext | null;
  totalNominalPoints: MonthlyNumericPoint[];
  revolvingNominalPoints: MonthlyNumericPoint[];
};

function numericSeries(
  observations: readonly ConsumerSpendingObservation[],
  metricSlug: string,
): MonthlyNumericPoint[] {
  const byPeriod = new Map<string, MonthlyNumericPoint>();
  for (const observation of observations) {
    if (observation.metricSlug !== metricSlug) continue;
    const value = Number(observation.value);
    if (!Number.isFinite(value)) continue;
    byPeriod.set(observation.periodStart, {
      periodStart: observation.periodStart,
      value,
    });
  }
  return [...byPeriod.values()].sort(
    (left, right) =>
      new Date(left.periodStart).getTime() -
      new Date(right.periodStart).getTime(),
  );
}

export function alignMonthlySeries(
  observations: readonly ConsumerSpendingObservation[],
  numeratorSlug: string,
  denominatorSlug: string,
): AlignedMonthlyPoint[] {
  const numerator = numericSeries(observations, numeratorSlug);
  const denominator = new Map(
    numericSeries(observations, denominatorSlug).map((point) => [
      point.periodStart,
      point.value,
    ]),
  );

  return numerator.flatMap((point): AlignedMonthlyPoint[] => {
    const denominatorValue = denominator.get(point.periodStart);
    return denominatorValue === undefined
      ? []
      : [
          {
            periodStart: point.periodStart,
            numerator: point.value,
            denominator: denominatorValue,
          },
        ];
  });
}

export function deflateCreditWithCpi(aligned: readonly AlignedMonthlyPoint[]): {
  reference: { periodStart: string; value: number } | null;
  points: DerivedCreditPoint[];
} {
  const valid = aligned
    .filter(
      (point) =>
        Number.isFinite(point.numerator) &&
        Number.isFinite(point.denominator) &&
        point.denominator > 0,
    )
    .sort(
      (left, right) =>
        new Date(left.periodStart).getTime() -
        new Date(right.periodStart).getTime(),
    );
  const latest = valid.at(-1);
  if (!latest) return { reference: null, points: [] };

  return {
    reference: { periodStart: latest.periodStart, value: latest.denominator },
    points: valid.map((point) => ({
      ...point,
      value: point.numerator * (latest.denominator / point.denominator),
    })),
  };
}

export function calculatePerCapitaCredit(
  aligned: readonly AlignedMonthlyPoint[],
): DerivedCreditPoint[] {
  return aligned.flatMap((point): DerivedCreditPoint[] => {
    if (
      !Number.isFinite(point.numerator) ||
      !Number.isFinite(point.denominator) ||
      point.denominator <= 0
    ) {
      return [];
    }

    return [
      {
        ...point,
        value: (point.numerator * 1_000) / point.denominator,
      },
    ];
  });
}

export function calculateCreditToDisposableIncome(
  aligned: readonly AlignedMonthlyPoint[],
): DerivedCreditPoint[] {
  return aligned.flatMap((point): DerivedCreditPoint[] => {
    if (
      !Number.isFinite(point.numerator) ||
      !Number.isFinite(point.denominator) ||
      point.denominator <= 0
    ) {
      return [];
    }

    return [
      {
        ...point,
        value: (point.numerator / (point.denominator * 1_000)) * 100,
      },
    ];
  });
}

function previousYearPeriod(periodStart: string): string {
  const date = new Date(periodStart);
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  return date.toISOString();
}

export function buildDerivedHistoricalContext(
  points: readonly DerivedCreditPoint[],
): DerivedHistoricalContext | null {
  const byPeriod = new Map<string, DerivedCreditPoint>();
  for (const point of points) {
    if (Number.isFinite(point.value)) byPeriod.set(point.periodStart, point);
  }
  const series = [...byPeriod.values()].sort(
    (left, right) =>
      new Date(left.periodStart).getTime() -
      new Date(right.periodStart).getTime(),
  );
  const current = series.at(-1);
  if (!current) return null;

  const yearAgo = byPeriod.get(previousYearPeriod(current.periodStart)) ?? null;
  const values = series.map((point) => point.value);
  const statistics = {
    minimum: minimum(values),
    maximum: maximum(values),
    median: median(values),
    percentile75: percentile(values, 75),
    percentile90: percentile(values, 90),
    percentileRank: percentileRank(values, current.value),
  };
  if (Object.values(statistics).some((value) => value === null)) return null;

  return {
    points: series,
    current,
    yearAgo,
    yearOverYearChange: yearOverYearChange(current.value, yearAgo?.value),
    minimum: statistics.minimum as number,
    maximum: statistics.maximum as number,
    median: statistics.median as number,
    percentile75: statistics.percentile75 as number,
    percentile90: statistics.percentile90 as number,
    percentileRank: statistics.percentileRank as number,
  };
}

export function buildNormalizedCreditAnalytics(
  observations: readonly ConsumerSpendingObservation[],
): NormalizedCreditAnalytics {
  const totalCpi = alignMonthlySeries(
    observations,
    NORMALIZED_CREDIT_METRICS.totalCredit,
    NORMALIZED_CREDIT_METRICS.cpi,
  );
  const deflated = deflateCreditWithCpi(totalCpi);
  const totalPopulation = alignMonthlySeries(
    observations,
    NORMALIZED_CREDIT_METRICS.totalCredit,
    NORMALIZED_CREDIT_METRICS.population,
  );
  const revolvingPopulation = alignMonthlySeries(
    observations,
    NORMALIZED_CREDIT_METRICS.revolvingCredit,
    NORMALIZED_CREDIT_METRICS.population,
  );
  const totalIncome = alignMonthlySeries(
    observations,
    NORMALIZED_CREDIT_METRICS.totalCredit,
    NORMALIZED_CREDIT_METRICS.disposableIncome,
  );

  return {
    cpiReference: deflated.reference,
    totalReal: buildDerivedHistoricalContext(deflated.points),
    totalPerCapita: buildDerivedHistoricalContext(
      calculatePerCapitaCredit(totalPopulation),
    ),
    totalToDisposableIncome: buildDerivedHistoricalContext(
      calculateCreditToDisposableIncome(totalIncome),
    ),
    revolvingPerCapita: buildDerivedHistoricalContext(
      calculatePerCapitaCredit(revolvingPopulation),
    ),
    totalNominalPoints: numericSeries(
      observations,
      NORMALIZED_CREDIT_METRICS.totalCredit,
    ),
    revolvingNominalPoints: numericSeries(
      observations,
      NORMALIZED_CREDIT_METRICS.revolvingCredit,
    ),
  };
}

export function formatUsdPerPerson(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCreditIncomeRatio(value: number): string {
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}%`;
}
