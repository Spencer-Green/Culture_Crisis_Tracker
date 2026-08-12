import type { Metadata } from "next";

import {
  CreditHistoryChart,
  type CreditHistoryView,
} from "@/components/credit-history-chart";
import { DashboardCard } from "@/components/dashboard-card";
import { DemandIndexChart } from "@/components/demand-index-chart";
import {
  buildNominalDemandSeries,
  buildRealDemandSeries,
  prepareMixedFrequencyChart,
} from "@/lib/consumer-demand";
import {
  buildHistoricalMetricContext,
  type HistoricalMetricContext,
} from "@/lib/historical-statistics";
import {
  buildNormalizedCreditAnalytics,
  formatCreditIncomeRatio,
  formatUsdPerPerson,
  type DerivedHistoricalContext,
} from "@/lib/normalized-credit";
import { formatPublishedValue } from "@/lib/source-value-format";
import type { ConsumerSpendingObservation } from "@/services/consumer-spending";
import { getConsumerSpendingData } from "@/services/consumer-spending";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Consumer Spending",
};

const METRIC_SLUGS = {
  australia: {
    total: "au-household-spending-total-current-price-sa",
    recreationValue: "au-recreation-culture-spending-current-price-sa",
    recreationChange: "au-recreation-culture-spending-mom-pct-sa",
    discretionaryChange: "au-discretionary-spending-mom-pct-sa",
  },
  unitedKingdom: {
    totalNominal: "uk-household-spending-total-current-price-sa",
    totalReal: "uk-household-spending-total-cvm-sa",
    recreationNominal: "uk-recreation-culture-spending-current-price-sa",
    recreationReal: "uk-recreation-culture-spending-cvm-sa",
  },
  unitedStates: {
    totalNominal: "us-pce-total-current-price",
    totalReal: "us-pce-total-real",
    recreationNominal: "us-recreation-services-pce-current-price",
    recreationReal: "us-recreation-services-pce-real",
    totalCredit: "us-total-consumer-credit-sa",
    revolvingCredit: "us-revolving-consumer-credit-sa",
    delinquency: "us-credit-card-delinquency-rate-sa",
    chargeOffs: "us-credit-card-chargeoff-rate-sa",
  },
  europeanUnion: {
    totalNominal: "eu-household-spending-total-current-price",
    totalReal: "eu-household-spending-total-real",
    recreationNominal: "eu-recreation-culture-spending-current-price",
    recreationReal: "eu-recreation-culture-spending-real",
  },
  canada: {
    totalNominal: "ca-household-spending-total-current-price",
    totalReal: "ca-household-spending-total-real",
    recreationNominal: "ca-recreation-culture-spending-current-price",
    recreationReal: "ca-recreation-culture-spending-real",
  },
} as const;

function latestObservation(
  observations: readonly ConsumerSpendingObservation[],
  metricSlug: string,
) {
  return observations.find(
    (observation) => observation.metricSlug === metricSlug,
  );
}

function formatPeriod(
  observation: ConsumerSpendingObservation,
  locale = "en-AU",
): string {
  const date = new Date(observation.periodStart);
  if (observation.frequency === "quarterly") {
    return `${date.getUTCFullYear()} Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
  }

  if (observation.frequency === "annual") {
    return String(date.getUTCFullYear());
  }

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatTimestamp(value: string, locale = "en-AU"): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatValue(value: string, unit: string, locale = "en-AU"): string {
  return formatPublishedValue(value, unit, locale).headline;
}

function MetricValue({
  observation,
  emptyMessage,
  locale = "en-AU",
  provenance,
  ingestionCommand = "the relevant ingestion command",
}: {
  observation: ConsumerSpendingObservation | undefined;
  emptyMessage: string;
  locale?: string;
  provenance: string;
  ingestionCommand?: string;
}) {
  if (!observation) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 px-5 py-10 text-center">
        <p className="text-sm text-zinc-400">{emptyMessage}</p>
        <p className="mt-1 text-xs text-zinc-600">
          Run {ingestionCommand} to populate this metric.
        </p>
      </div>
    );
  }

  const presentation = formatPublishedValue(
    observation.value,
    observation.unit,
    locale,
  );

  return (
    <div>
      <p className="font-data text-3xl text-zinc-50">{presentation.headline}</p>
      <p className="mt-2 text-xs text-zinc-400">{presentation.descriptor}</p>
      {presentation.descriptor !== presentation.sourceUnit ? (
        <p className="mt-1 text-[11px] text-zinc-600">
          Source unit: {presentation.sourceUnit}
        </p>
      ) : null}
      <p className="mt-2 text-[11px] font-medium text-blue-300">{provenance}</p>
      <dl className="mt-5 grid gap-3 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-zinc-600">Period</dt>
          <dd className="mt-1 text-zinc-300">
            {formatPeriod(observation, locale)}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-600">Frequency</dt>
          <dd className="mt-1 text-zinc-300 capitalize">
            {observation.frequency}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-600">Retrieved</dt>
          <dd className="mt-1 text-zinc-300">
            {formatTimestamp(observation.retrievedAt, locale)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function calculateQuarterlyChange(
  observations: readonly ConsumerSpendingObservation[],
  metricSlug: string,
) {
  const series = observations.filter(
    (observation) => observation.metricSlug === metricSlug,
  );
  if (series.length < 2) {
    return null;
  }

  const latest = Number(series[0].value);
  const previous = Number(series[1].value);
  if (
    !Number.isFinite(latest) ||
    !Number.isFinite(previous) ||
    previous === 0
  ) {
    return null;
  }

  return {
    value: ((latest - previous) / previous) * 100,
    latest: series[0],
    previous: series[1],
  };
}

function formatRate(value: number): string {
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}%`;
}

function formatSigned(value: number, suffix: string): string {
  return `${new Intl.NumberFormat("en-US", {
    signDisplay: "always",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}${suffix}`;
}

function formatHistoricalMoney(value: number): string {
  return formatPublishedValue(String(value), "USD millions", "en-US").headline;
}

function HistoricalRows({
  rows,
}: {
  rows: readonly { label: string; value: string }[];
}) {
  return (
    <dl className="grid gap-x-5 gap-y-3 border-t border-zinc-800 pt-5 text-xs sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label}>
          <dt className="text-zinc-600">{row.label}</dt>
          <dd className="font-data mt-1 text-zinc-300">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CreditBalanceContext({
  title,
  context,
  observation,
  normalization,
}: {
  title: string;
  context: HistoricalMetricContext | null;
  observation: ConsumerSpendingObservation | undefined;
  normalization?: {
    real?: DerivedHistoricalContext | null;
    perCapita: DerivedHistoricalContext | null;
    income?: DerivedHistoricalContext | null;
    cpiReferencePeriod?: string | null;
  };
}) {
  if (!context) {
    return (
      <DashboardCard
        title={title}
        description="Monthly seasonally adjusted balance"
      >
        <MetricValue
          observation={observation}
          emptyMessage={`No ${title.toLowerCase()} observations`}
          locale="en-US"
          provenance="FRED / Federal Reserve published balance"
          ingestionCommand="the FRED ingestion command"
        />
      </DashboardCard>
    );
  }

  const currentPresentation = formatPublishedValue(
    context.current.value,
    context.current.unit,
    "en-US",
  );
  const rows = [
    {
      label: "Previous month",
      value: context.previous
        ? `${formatHistoricalMoney(Number(context.previous.value))} · ${formatPeriod(context.previous, "en-US")}`
        : "Not available",
    },
    {
      label: "Month-on-month",
      value:
        context.previousChange?.percent === null ||
        context.previousChange?.percent === undefined
          ? "Not available"
          : formatSigned(context.previousChange.percent, "%"),
    },
    {
      label: "Same month one year earlier",
      value: context.yearAgo
        ? `${formatHistoricalMoney(Number(context.yearAgo.value))} · ${formatPeriod(context.yearAgo, "en-US")}`
        : "Not available",
    },
    {
      label: "Year-on-year",
      value:
        context.yearOverYearChange?.percent === null ||
        context.yearOverYearChange?.percent === undefined
          ? "Not available"
          : formatSigned(context.yearOverYearChange.percent, "%"),
    },
    {
      label: "Historical median",
      value: formatHistoricalMoney(context.median),
    },
    {
      label: "Historical maximum",
      value: formatHistoricalMoney(context.maximum),
    },
    {
      label: "Current nominal percentile",
      value: `${context.percentileRank.toFixed(1)}th percentile`,
    },
    {
      label: "Full-history observations",
      value: new Intl.NumberFormat("en-US").format(context.observationCount),
    },
  ];
  const normalizedRows = normalization
    ? [
        ...(normalization.real !== undefined
          ? [
              {
                label: "Inflation-adjusted consumer credit",
                value: normalization.real
                  ? formatHistoricalMoney(normalization.real.current.value)
                  : "Not available",
              },
              {
                label: "Inflation-adjusted percentile",
                value: normalization.real
                  ? `${normalization.real.percentileRank.toFixed(1)}th percentile`
                  : "Not available",
              },
              {
                label: "Inflation-adjusted YoY",
                value:
                  normalization.real?.yearOverYearChange?.percent === null ||
                  normalization.real?.yearOverYearChange?.percent === undefined
                    ? "Not available"
                    : formatSigned(
                        normalization.real.yearOverYearChange.percent,
                        "%",
                      ),
              },
            ]
          : []),
        {
          label: "Consumer credit per capita",
          value: normalization.perCapita
            ? formatUsdPerPerson(normalization.perCapita.current.value)
            : "Not available",
        },
        {
          label: "Per-capita historical percentile",
          value: normalization.perCapita
            ? `${normalization.perCapita.percentileRank.toFixed(1)}th percentile`
            : "Not available",
        },
        {
          label: "Per-capita YoY",
          value:
            normalization.perCapita?.yearOverYearChange?.percent === null ||
            normalization.perCapita?.yearOverYearChange?.percent === undefined
              ? "Not available"
              : formatSigned(
                  normalization.perCapita.yearOverYearChange.percent,
                  "%",
                ),
        },
        ...(normalization.income !== undefined
          ? [
              {
                label: "Credit / disposable income",
                value: normalization.income
                  ? formatCreditIncomeRatio(normalization.income.current.value)
                  : "Not available",
              },
              {
                label: "Credit / income historical percentile",
                value: normalization.income
                  ? `${normalization.income.percentileRank.toFixed(1)}th percentile`
                  : "Not available",
              },
              {
                label: "Credit / income one-year change",
                value: normalization.income?.yearOverYearChange
                  ? formatSigned(
                      normalization.income.yearOverYearChange.absolute,
                      " pp",
                    )
                  : "Not available",
              },
            ]
          : []),
      ]
    : [];

  return (
    <DashboardCard
      title={title}
      description="Monthly seasonally adjusted balance"
    >
      <p className="font-data text-3xl text-zinc-50">
        {currentPresentation.headline}
      </p>
      <p className="mt-2 text-xs text-zinc-500">
        {formatPeriod(context.current, "en-US")} · {context.current.unit}
      </p>
      <p className="mt-3 text-[11px] font-medium text-blue-300">
        Nominal historical context
      </p>
      <HistoricalRows rows={rows} />
      {normalization ? (
        <div className="mt-5 rounded-xl border border-blue-900/40 bg-blue-950/10 p-4">
          <p className="text-[11px] font-medium text-blue-300">
            Culture Crisis Tracker calculations
          </p>
          {normalization.cpiReferencePeriod ? (
            <p className="mt-1 text-[11px] text-zinc-600">
              Real values use the CPI from {normalization.cpiReferencePeriod} as
              the latest-period-dollar reference.
            </p>
          ) : null}
          <HistoricalRows rows={normalizedRows} />
        </div>
      ) : null}
    </DashboardCard>
  );
}

function CreditPerformanceContext({
  title,
  context,
  observation,
  semantics,
}: {
  title: string;
  context: HistoricalMetricContext | null;
  observation: ConsumerSpendingObservation | undefined;
  semantics: string;
}) {
  if (!context) {
    return (
      <DashboardCard title={title} description={semantics}>
        <MetricValue
          observation={observation}
          emptyMessage={`No ${title.toLowerCase()} observations`}
          locale="en-US"
          provenance="FRED / Federal Reserve published rate"
          ingestionCommand="the FRED ingestion command"
        />
      </DashboardCard>
    );
  }

  const rows = [
    { label: "Historical minimum", value: formatRate(context.minimum) },
    { label: "Historical median", value: formatRate(context.median) },
    { label: "25th percentile", value: formatRate(context.percentile25) },
    { label: "75th percentile", value: formatRate(context.percentile75) },
    { label: "90th percentile", value: formatRate(context.percentile90) },
    { label: "97.5th percentile", value: formatRate(context.percentile975) },
    { label: "Historical maximum", value: formatRate(context.maximum) },
    {
      label: "Previous quarter",
      value: context.previous
        ? `${formatRate(Number(context.previous.value))}${context.previousChange ? ` · ${formatSigned(context.previousChange.absolute, " pp QoQ")}` : ""}`
        : "Not available",
    },
    {
      label: "One year ago",
      value: context.yearAgo
        ? `${formatRate(Number(context.yearAgo.value))}${context.yearOverYearChange ? ` · ${formatSigned(context.yearOverYearChange.absolute, " pp YoY")}` : ""}`
        : "Not available",
    },
    {
      label: "Full-history observations",
      value: new Intl.NumberFormat("en-US").format(context.observationCount),
    },
  ];

  return (
    <DashboardCard title={title} description={semantics}>
      <p className="font-data text-3xl text-zinc-50">
        {formatRate(Number(context.current.value))}
      </p>
      <p className="mt-2 text-xs text-zinc-500">
        {formatPeriod(context.current, "en-US")} · Quarterly ·{" "}
        {context.current.unit}
      </p>
      <div className="mt-5 rounded-xl border border-blue-900/40 bg-blue-950/15 p-4">
        <p className="text-[11px] font-medium text-blue-300">
          Culture Crisis Tracker historical classification
        </p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <p className="text-xl font-medium text-zinc-100">
            {context.classification}
          </p>
          <p className="font-data text-xs text-zinc-400">
            {context.percentileRank.toFixed(1)}th percentile
          </p>
        </div>
      </div>
      <HistoricalRows rows={rows} />
    </DashboardCard>
  );
}

export default async function ConsumerSpendingPage() {
  const data = await getConsumerSpendingData();
  const australianObservations = data.observations.filter(
    (observation) => observation.sourceSlug === "abs",
  );
  const ukObservations = data.observations.filter(
    (observation) => observation.sourceSlug === "ons",
  );
  const beaObservations = data.observations.filter(
    (observation) => observation.sourceSlug === "bea",
  );
  const fredObservations = data.observations.filter(
    (observation) => observation.sourceSlug === "fred",
  );
  const eurostatObservations = data.observations.filter(
    (observation) => observation.sourceSlug === "eurostat",
  );
  const canadianObservations = data.observations.filter(
    (observation) => observation.sourceSlug === "statcan",
  );
  const total = latestObservation(
    australianObservations,
    METRIC_SLUGS.australia.total,
  );
  const recreationValue = latestObservation(
    australianObservations,
    METRIC_SLUGS.australia.recreationValue,
  );
  const recreationChange = latestObservation(
    australianObservations,
    METRIC_SLUGS.australia.recreationChange,
  );
  const discretionaryChange = latestObservation(
    australianObservations,
    METRIC_SLUGS.australia.discretionaryChange,
  );
  const ukTotalNominal = latestObservation(
    ukObservations,
    METRIC_SLUGS.unitedKingdom.totalNominal,
  );
  const ukTotalReal = latestObservation(
    ukObservations,
    METRIC_SLUGS.unitedKingdom.totalReal,
  );
  const ukRecreationNominal = latestObservation(
    ukObservations,
    METRIC_SLUGS.unitedKingdom.recreationNominal,
  );
  const ukRecreationReal = latestObservation(
    ukObservations,
    METRIC_SLUGS.unitedKingdom.recreationReal,
  );
  const ukRealQuarterlyChange = calculateQuarterlyChange(
    ukObservations,
    METRIC_SLUGS.unitedKingdom.totalReal,
  );
  const usTotalNominal = latestObservation(
    beaObservations,
    METRIC_SLUGS.unitedStates.totalNominal,
  );
  const usTotalReal = latestObservation(
    beaObservations,
    METRIC_SLUGS.unitedStates.totalReal,
  );
  const usRecreationNominal = latestObservation(
    beaObservations,
    METRIC_SLUGS.unitedStates.recreationNominal,
  );
  const usRecreationReal = latestObservation(
    beaObservations,
    METRIC_SLUGS.unitedStates.recreationReal,
  );
  const usTotalCredit = latestObservation(
    fredObservations,
    METRIC_SLUGS.unitedStates.totalCredit,
  );
  const usRevolvingCredit = latestObservation(
    fredObservations,
    METRIC_SLUGS.unitedStates.revolvingCredit,
  );
  const usDelinquency = latestObservation(
    fredObservations,
    METRIC_SLUGS.unitedStates.delinquency,
  );
  const usChargeOffs = latestObservation(
    fredObservations,
    METRIC_SLUGS.unitedStates.chargeOffs,
  );
  const euTotalNominal = latestObservation(
    eurostatObservations,
    METRIC_SLUGS.europeanUnion.totalNominal,
  );
  const euTotalReal = latestObservation(
    eurostatObservations,
    METRIC_SLUGS.europeanUnion.totalReal,
  );
  const euRecreationNominal = latestObservation(
    eurostatObservations,
    METRIC_SLUGS.europeanUnion.recreationNominal,
  );
  const euRecreationReal = latestObservation(
    eurostatObservations,
    METRIC_SLUGS.europeanUnion.recreationReal,
  );
  const caTotalNominal = latestObservation(
    canadianObservations,
    METRIC_SLUGS.canada.totalNominal,
  );
  const caTotalReal = latestObservation(
    canadianObservations,
    METRIC_SLUGS.canada.totalReal,
  );
  const caRecreationNominal = latestObservation(
    canadianObservations,
    METRIC_SLUGS.canada.recreationNominal,
  );
  const caRecreationReal = latestObservation(
    canadianObservations,
    METRIC_SLUGS.canada.recreationReal,
  );
  const recentAustralianObservations = australianObservations.slice(0, 24);
  const recentUkObservations = ukObservations.slice(0, 24);
  const nominalDemandSeries = buildNominalDemandSeries(data.observations);
  const realDemandSeries = buildRealDemandSeries(data.observations);
  const nominalDemandChart = prepareMixedFrequencyChart(nominalDemandSeries);
  const realDemandChart = prepareMixedFrequencyChart(realDemandSeries);
  const totalCreditContext = buildHistoricalMetricContext(
    fredObservations,
    METRIC_SLUGS.unitedStates.totalCredit,
    "monthly",
  );
  const revolvingCreditContext = buildHistoricalMetricContext(
    fredObservations,
    METRIC_SLUGS.unitedStates.revolvingCredit,
    "monthly",
  );
  const delinquencyContext = buildHistoricalMetricContext(
    fredObservations,
    METRIC_SLUGS.unitedStates.delinquency,
    "quarterly",
  );
  const chargeOffContext = buildHistoricalMetricContext(
    fredObservations,
    METRIC_SLUGS.unitedStates.chargeOffs,
    "quarterly",
  );
  const normalizedCredit = buildNormalizedCreditAnalytics(fredObservations);
  const cpiReferencePeriod = normalizedCredit.cpiReference
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(normalizedCredit.cpiReference.periodStart))
    : null;
  const totalCreditViews: CreditHistoryView[] = [
    {
      id: "nominal",
      label: "Nominal",
      unit: "usd-millions",
      points: normalizedCredit.totalNominalPoints,
    },
    ...(normalizedCredit.totalReal
      ? [
          {
            id: "real",
            label: "Inflation-adjusted",
            unit: "usd-millions" as const,
            points: normalizedCredit.totalReal.points,
          },
        ]
      : []),
    ...(normalizedCredit.totalPerCapita
      ? [
          {
            id: "per-capita",
            label: "Per capita",
            unit: "usd-per-person" as const,
            points: normalizedCredit.totalPerCapita.points,
          },
        ]
      : []),
    ...(normalizedCredit.totalToDisposableIncome
      ? [
          {
            id: "income",
            label: "Credit / disposable income",
            unit: "percent" as const,
            points: normalizedCredit.totalToDisposableIncome.points,
          },
        ]
      : []),
  ];
  const revolvingCreditViews: CreditHistoryView[] = [
    {
      id: "nominal",
      label: "Nominal",
      unit: "usd-millions",
      points: normalizedCredit.revolvingNominalPoints,
    },
    ...(normalizedCredit.revolvingPerCapita
      ? [
          {
            id: "per-capita",
            label: "Per capita",
            unit: "usd-per-person" as const,
            points: normalizedCredit.revolvingPerCapita.points,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-data text-xs tracking-[0.2em] text-blue-400 uppercase">
            Consumer Spending
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
            Household spending by market
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            Current Australian, UK, US, and Canadian source observations. Annual
            EU data is retained separately as a structural benchmark. No
            synthetic fallback values, resampling, interpolation, or currency
            conversions are displayed.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <a
            href="https://www.abs.gov.au/statistics/economy/finance/monthly-household-spending-indicator"
            className="text-xs text-blue-400 underline decoration-blue-900 underline-offset-4 hover:text-blue-300"
          >
            Australian Bureau of Statistics
          </a>
          <a
            href="https://www.ons.gov.uk/economy/nationalaccounts/satelliteaccounts/datasets/consumertrends"
            className="text-xs text-blue-400 underline decoration-blue-900 underline-offset-4 hover:text-blue-300"
          >
            Office for National Statistics
          </a>
          <a
            href="https://apps.bea.gov/iTable/?ReqID=19&step=2"
            className="text-xs text-blue-400 underline decoration-blue-900 underline-offset-4 hover:text-blue-300"
          >
            U.S. Bureau of Economic Analysis
          </a>
          <a
            href="https://fred.stlouisfed.org/"
            className="text-xs text-blue-400 underline decoration-blue-900 underline-offset-4 hover:text-blue-300"
          >
            Federal Reserve Economic Data
          </a>
          <a
            href="https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3610012401"
            className="text-xs text-blue-400 underline decoration-blue-900 underline-offset-4 hover:text-blue-300"
          >
            Statistics Canada
          </a>
        </div>
      </div>

      {data.databaseStatus === "unavailable" ? (
        <div className="rounded-2xl border border-amber-900/50 bg-amber-950/20 p-5 text-sm text-amber-200/80">
          Consumer spending data is temporarily unavailable because the database
          could not be reached.
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardCard
          title="Recreation & Culture Demand — Nominal Index"
          description="Baseline = 100 at first available 2019 observation"
        >
          <DemandIndexChart
            data={nominalDemandChart}
            series={nominalDemandSeries}
          />
        </DashboardCard>
        <DashboardCard
          title="Recreation Demand — Real Index"
          description="Baseline = 100 at first available 2019 observation"
        >
          <DemandIndexChart data={realDemandChart} series={realDemandSeries} />
        </DashboardCard>
      </div>

      <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-xs leading-5 text-zinc-500">
        Indexing makes unlike currency levels easier to compare, but source
        definitions remain distinct: ABS and ONS cover recreation and culture,
        BEA covers recreation services, and Statistics Canada covers recreation
        and culture. Nominal and real measures are shown separately. The annual
        EU structural benchmark is excluded from this current-demand comparison.
      </p>

      <div className="border-b border-zinc-800 pb-3">
        <h2 className="text-lg font-semibold text-zinc-100">Australia</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Monthly, seasonally adjusted ABS observations
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <DashboardCard
          title="Australian Household Spending"
          description="Total, current prices, seasonally adjusted"
        >
          <MetricValue
            observation={total}
            emptyMessage="No total household spending observations"
            provenance="ABS published observation"
          />
        </DashboardCard>
        <DashboardCard
          title="Recreation & Culture"
          description="Current-price value and monthly change"
        >
          <div className="space-y-6">
            <MetricValue
              observation={recreationValue}
              emptyMessage="No recreation and culture observations"
              provenance="ABS published observation"
            />
            {recreationChange ? (
              <div className="border-t border-zinc-800 pt-4">
                <p className="text-xs text-zinc-500">
                  Latest month-on-month change
                </p>
                <p className="font-data mt-2 text-xl text-zinc-100">
                  {formatValue(recreationChange.value, recreationChange.unit)}
                </p>
                <p className="mt-1 text-xs text-zinc-600">
                  {formatPeriod(recreationChange)}
                </p>
              </div>
            ) : null}
          </div>
        </DashboardCard>
        <DashboardCard
          title="Discretionary Spending"
          description="ABS-defined monthly discretionary signal"
        >
          <MetricValue
            observation={discretionaryChange}
            emptyMessage="No discretionary spending observations"
            provenance="ABS published observation"
          />
        </DashboardCard>
      </div>

      <DashboardCard
        title="Recent observations"
        description="Latest persisted ABS HSI_M records"
      >
        {recentAustralianObservations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 px-5 py-10 text-center">
            <p className="text-sm text-zinc-400">
              No ABS observations have been ingested.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b border-zinc-800 text-zinc-600">
                <tr>
                  <th className="px-3 py-3 font-medium">Period</th>
                  <th className="px-3 py-3 font-medium">Metric</th>
                  <th className="px-3 py-3 font-medium">Value</th>
                  <th className="px-3 py-3 font-medium">Unit</th>
                  <th className="px-3 py-3 font-medium">Frequency</th>
                  <th className="px-3 py-3 font-medium">Retrieved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {recentAustralianObservations.map((observation) => (
                  <tr
                    key={`${observation.metricSlug}-${observation.periodStart}`}
                  >
                    <td className="font-data px-3 py-3 text-zinc-300">
                      {formatPeriod(observation)}
                    </td>
                    <td className="px-3 py-3 text-zinc-400">
                      {observation.metricName}
                    </td>
                    <td className="font-data px-3 py-3 text-zinc-200">
                      {formatValue(observation.value, observation.unit)}
                    </td>
                    <td className="px-3 py-3 text-zinc-500">
                      {observation.unit}
                    </td>
                    <td className="px-3 py-3 text-zinc-500 capitalize">
                      {observation.frequency}
                    </td>
                    <td className="font-data px-3 py-3 text-zinc-600">
                      {formatTimestamp(observation.retrievedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashboardCard>

      <div className="border-b border-zinc-800 pt-4 pb-3">
        <h2 className="text-lg font-semibold text-zinc-100">Canada</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Quarterly Statistics Canada observations, seasonally adjusted at
          quarterly rates. Latest available periods follow the official
          quarterly release cadence.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardCard
          title="Household Final Consumption Expenditure"
          description="Current prices and 2017 constant prices"
        >
          <div className="space-y-6">
            <MetricValue
              observation={caTotalNominal}
              emptyMessage="No Canadian nominal household spending observations"
              locale="en-CA"
              provenance="Statistics Canada — current prices; seasonally adjusted at quarterly rates"
              ingestionCommand="the Statistics Canada ingestion command"
            />
            <div className="border-t border-zinc-800 pt-5">
              <MetricValue
                observation={caTotalReal}
                emptyMessage="No Canadian real household spending observations"
                locale="en-CA"
                provenance="Statistics Canada — 2017 constant prices; seasonally adjusted at quarterly rates"
                ingestionCommand="the Statistics Canada ingestion command"
              />
            </div>
          </div>
        </DashboardCard>
        <DashboardCard
          title="Recreation and Culture"
          description="Published category, current and 2017 constant prices"
        >
          <div className="space-y-6">
            <MetricValue
              observation={caRecreationNominal}
              emptyMessage="No Canadian nominal recreation and culture observations"
              locale="en-CA"
              provenance="Statistics Canada — current prices; seasonally adjusted at quarterly rates"
              ingestionCommand="the Statistics Canada ingestion command"
            />
            <div className="border-t border-zinc-800 pt-5">
              <MetricValue
                observation={caRecreationReal}
                emptyMessage="No Canadian real recreation and culture observations"
                locale="en-CA"
                provenance="Statistics Canada — 2017 constant prices; seasonally adjusted at quarterly rates"
                ingestionCommand="the Statistics Canada ingestion command"
              />
            </div>
          </div>
        </DashboardCard>
      </div>

      <div className="border-b border-zinc-800 pt-4 pb-3">
        <h2 className="text-lg font-semibold text-zinc-100">United Kingdom</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Quarterly, seasonally adjusted ONS Consumer Trends observations
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <DashboardCard
          title="Total Household Spending"
          description="Nominal expenditure and real chained volume measure"
        >
          <div className="space-y-6">
            <MetricValue
              observation={ukTotalNominal}
              emptyMessage="No UK nominal household spending observations"
              locale="en-GB"
              provenance="ONS published observation — current prices"
            />
            <div className="border-t border-zinc-800 pt-5">
              <MetricValue
                observation={ukTotalReal}
                emptyMessage="No UK real household spending observations"
                locale="en-GB"
                provenance="ONS published observation — chained volume measure"
              />
            </div>
          </div>
        </DashboardCard>
        <DashboardCard
          title="Recreation & Culture"
          description="COICOP division 09, nominal and real measures"
        >
          <div className="space-y-6">
            <MetricValue
              observation={ukRecreationNominal}
              emptyMessage="No UK nominal recreation observations"
              locale="en-GB"
              provenance="ONS published observation — current prices"
            />
            <div className="border-t border-zinc-800 pt-5">
              <MetricValue
                observation={ukRecreationReal}
                emptyMessage="No UK real recreation observations"
                locale="en-GB"
                provenance="ONS published observation — chained volume measure"
              />
            </div>
          </div>
        </DashboardCard>
        <DashboardCard
          title="Real Spending Signal"
          description="Latest total-household CVM quarter-on-quarter movement"
        >
          {ukRealQuarterlyChange ? (
            <div>
              <p className="font-data text-3xl text-zinc-50">
                {new Intl.NumberFormat("en-GB", {
                  signDisplay: "always",
                  maximumFractionDigits: 2,
                }).format(ukRealQuarterlyChange.value)}
                %
              </p>
              <p className="mt-2 text-[11px] font-medium text-amber-300">
                Culture Crisis Tracker calculated change
              </p>
              <p className="mt-4 text-xs leading-5 text-zinc-500">
                Calculated from consecutive ONS-published CVM observations for{" "}
                {formatPeriod(ukRealQuarterlyChange.previous, "en-GB")} and{" "}
                {formatPeriod(ukRealQuarterlyChange.latest, "en-GB")}. This is
                not a separately published ONS series.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-800 px-5 py-10 text-center">
              <p className="text-sm text-zinc-400">
                Two consecutive UK CVM quarters are required.
              </p>
            </div>
          )}
        </DashboardCard>
      </div>

      <DashboardCard
        title="Recent UK observations"
        description="Latest persisted ONS CT quarterly records"
      >
        {recentUkObservations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 px-5 py-10 text-center">
            <p className="text-sm text-zinc-400">
              No ONS observations have been ingested.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead className="border-b border-zinc-800 text-zinc-600">
                <tr>
                  <th className="px-3 py-3 font-medium">Quarter</th>
                  <th className="px-3 py-3 font-medium">Metric</th>
                  <th className="px-3 py-3 font-medium">Value</th>
                  <th className="px-3 py-3 font-medium">Unit</th>
                  <th className="px-3 py-3 font-medium">Frequency</th>
                  <th className="px-3 py-3 font-medium">Provenance</th>
                  <th className="px-3 py-3 font-medium">Retrieved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {recentUkObservations.map((observation) => (
                  <tr
                    key={`${observation.metricSlug}-${observation.periodStart}`}
                  >
                    <td className="font-data px-3 py-3 text-zinc-300">
                      {formatPeriod(observation, "en-GB")}
                    </td>
                    <td className="px-3 py-3 text-zinc-400">
                      {observation.metricName}
                    </td>
                    <td className="font-data px-3 py-3 text-zinc-200">
                      {formatValue(
                        observation.value,
                        observation.unit,
                        "en-GB",
                      )}
                    </td>
                    <td className="px-3 py-3 text-zinc-500">
                      {observation.unit}
                    </td>
                    <td className="px-3 py-3 text-zinc-500 capitalize">
                      {observation.frequency}
                    </td>
                    <td className="px-3 py-3 text-zinc-500">
                      ONS published observation
                    </td>
                    <td className="font-data px-3 py-3 text-zinc-600">
                      {formatTimestamp(observation.retrievedAt, "en-GB")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashboardCard>

      <div className="border-b border-zinc-800 pt-4 pb-3">
        <h2 className="text-lg font-semibold text-zinc-100">United States</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Monthly BEA consumption demand and native-frequency FRED credit
          conditions
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-zinc-200">
          Household Consumption
        </h3>
        <p className="mt-2 max-w-4xl text-xs leading-5 text-zinc-500">
          SAAR = seasonally adjusted annual rate. Monthly BEA values show the
          annualized spending pace implied by that month, not the amount spent
          during the month itself.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardCard
          title="Total Personal Consumption Expenditures"
          description="BEA NIPA total PCE, nominal and real"
        >
          <div className="space-y-6">
            <MetricValue
              observation={usTotalNominal}
              emptyMessage="No US nominal total PCE observations"
              locale="en-US"
              provenance="BEA published observation — current dollars, SAAR"
              ingestionCommand="the BEA ingestion command"
            />
            <div className="border-t border-zinc-800 pt-5">
              <MetricValue
                observation={usTotalReal}
                emptyMessage="No US real total PCE observations"
                locale="en-US"
                provenance="BEA published observation — chained 2017 dollars, SAAR"
                ingestionCommand="the BEA ingestion command"
              />
            </div>
          </div>
        </DashboardCard>
        <DashboardCard
          title="Recreation Services"
          description="BEA terminology; recreational goods are not combined"
        >
          <div className="space-y-6">
            <MetricValue
              observation={usRecreationNominal}
              emptyMessage="No US nominal recreation services observations"
              locale="en-US"
              provenance="BEA published observation — current dollars, SAAR"
              ingestionCommand="the BEA ingestion command"
            />
            <div className="border-t border-zinc-800 pt-5">
              <MetricValue
                observation={usRecreationReal}
                emptyMessage="No US real recreation services observations"
                locale="en-US"
                provenance="BEA published observation — chained 2017 dollars, SAAR"
                ingestionCommand="the BEA ingestion command"
              />
            </div>
          </div>
        </DashboardCard>
      </div>

      <div className="border-b border-zinc-800 pb-3">
        <h3 className="text-sm font-semibold text-zinc-200">
          Credit &amp; Household Stress
        </h3>
        <p className="mt-2 max-w-4xl text-xs leading-5 text-zinc-500">
          Raw FRED indicators are shown separately from BEA consumption demand.
          Monthly balances and quarterly stress rates are not combined into an
          index, scored, or treated as evidence of causation.
        </p>
      </div>

      <div>
        <h4 className="text-xs font-semibold tracking-[0.12em] text-zinc-400 uppercase">
          Outstanding Credit
        </h4>
        <div className="mt-4 grid gap-6 xl:grid-cols-2">
          <CreditBalanceContext
            title="Total Consumer Credit"
            context={totalCreditContext}
            observation={usTotalCredit}
            normalization={{
              real: normalizedCredit.totalReal,
              perCapita: normalizedCredit.totalPerCapita,
              income: normalizedCredit.totalToDisposableIncome,
              cpiReferencePeriod,
            }}
          />
          <CreditBalanceContext
            title="Revolving Consumer Credit"
            context={revolvingCreditContext}
            observation={usRevolvingCredit}
            normalization={{
              perCapita: normalizedCredit.revolvingPerCapita,
            }}
          />
        </div>
        <p className="mt-3 text-xs leading-5 text-zinc-600">
          Nominal credit tends to rise with inflation, population, and income
          growth. Real, per-capita, and income-relative measures provide more
          meaningful historical context. A high nominal percentile is not, by
          itself, interpreted as credit stress.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardCard
          title="Total Consumer Credit History"
          description="Switch between distinct native and tracker-derived units"
        >
          <CreditHistoryChart views={totalCreditViews} />
        </DashboardCard>
        <DashboardCard
          title="Revolving Consumer Credit History"
          description="Nominal and population-adjusted monthly views"
        >
          <CreditHistoryChart views={revolvingCreditViews} />
        </DashboardCard>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            title: "Real credit",
            copy: "Controls for general inflation using CPIAUCSL and expresses history in latest aligned-period dollars.",
          },
          {
            title: "Per capita",
            copy: "Controls for population growth using POPTHM. It is credit per person, not credit per borrower.",
          },
          {
            title: "Credit / disposable income",
            copy: "Compares consumer-credit stock with annualized disposable personal income. DSPI is not divided by twelve.",
          },
          {
            title: "Historical percentile",
            copy: "Describes position within each derived series’ history. It does not prove financial crisis or causation.",
          },
        ].map((item) => (
          <div
            key={item.title}
            className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"
          >
            <p className="text-xs font-medium text-zinc-300">{item.title}</p>
            <p className="mt-2 text-[11px] leading-5 text-zinc-600">
              {item.copy}
            </p>
          </div>
        ))}
      </div>

      <div>
        <h4 className="text-xs font-semibold tracking-[0.12em] text-zinc-400 uppercase">
          Credit Performance
        </h4>
        <div className="mt-4 grid gap-6 xl:grid-cols-2">
          <CreditPerformanceContext
            title="Credit-Card Delinquency"
            context={delinquencyContext}
            observation={usDelinquency}
            semantics="Quarterly, seasonally adjusted, end of period"
          />
          <CreditPerformanceContext
            title="Credit-Card Charge-Offs"
            context={chargeOffContext}
            observation={usChargeOffs}
            semantics="Quarterly, seasonally adjusted, annualized and net of recoveries"
          />
        </div>
        <p className="mt-3 text-xs leading-5 text-zinc-600">
          The Federal Reserve delinquency series covers loans at least 30 days
          past due and still accruing, plus loans in nonaccrual status.
          Delinquency is not described here as default, and neither performance
          series establishes causation.
        </p>
      </div>

      <details className="group overflow-hidden rounded-2xl border border-amber-900/30 bg-amber-950/5">
        <summary className="cursor-pointer list-none px-5 py-5 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-amber-100">
                EU Structural Benchmark
              </p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Eurostat annual EU27_2020 national-accounts history, retained
                for structural and future historical analysis rather than
                current demand monitoring.
              </p>
            </div>
            <span className="text-xs text-amber-300/70 group-open:hidden">
              Show annual benchmark
            </span>
            <span className="hidden text-xs text-amber-300/70 group-open:inline">
              Hide benchmark
            </span>
          </div>
        </summary>
        <div className="border-t border-amber-900/20 px-5 py-6 sm:px-6">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <p className="max-w-4xl text-xs leading-5 text-zinc-500">
              These observations are annual and currently end in 2024. They are
              excluded from active current-source counts, headline freshness,
              and current cross-market demand charts. No persisted observations
              have been changed.
            </p>
            <a
              href="https://ec.europa.eu/eurostat/databrowser/view/nama_10_cp18/default/table"
              className="shrink-0 text-xs text-amber-300 underline decoration-amber-900 underline-offset-4 hover:text-amber-200"
            >
              Eurostat dataset
            </a>
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <DashboardCard
              title="Household Final Consumption Expenditure"
              description="EU27_2020 annual total, nominal and chain-linked volume"
            >
              <div className="space-y-6">
                <MetricValue
                  observation={euTotalNominal}
                  emptyMessage="No EU nominal household spending observations"
                  locale="en-IE"
                  provenance="Eurostat published observation — current prices"
                  ingestionCommand="the Eurostat ingestion command"
                />
                <div className="border-t border-zinc-800 pt-5">
                  <MetricValue
                    observation={euTotalReal}
                    emptyMessage="No EU real household spending observations"
                    locale="en-IE"
                    provenance="Eurostat published observation — chain-linked volume (2020)"
                    ingestionCommand="the Eurostat ingestion command"
                  />
                </div>
              </div>
            </DashboardCard>
            <DashboardCard
              title="Recreation, Sport and Culture"
              description="COICOP 2018 division 09, annual nominal and real measures"
            >
              <div className="space-y-6">
                <MetricValue
                  observation={euRecreationNominal}
                  emptyMessage="No EU nominal recreation, sport and culture observations"
                  locale="en-IE"
                  provenance="Eurostat published observation — current prices"
                  ingestionCommand="the Eurostat ingestion command"
                />
                <div className="border-t border-zinc-800 pt-5">
                  <MetricValue
                    observation={euRecreationReal}
                    emptyMessage="No EU real recreation, sport and culture observations"
                    locale="en-IE"
                    provenance="Eurostat published observation — chain-linked volume (2020)"
                    ingestionCommand="the Eurostat ingestion command"
                  />
                </div>
              </div>
            </DashboardCard>
          </div>
        </div>
      </details>
    </div>
  );
}
