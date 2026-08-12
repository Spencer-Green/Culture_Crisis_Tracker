import type { Metadata } from "next";

import {
  CreditHistoryChart,
  type CreditHistoryView,
} from "@/components/credit-history-chart";
import {
  CountryDemandSummary,
  type DemandSummaryRow,
} from "@/components/country-demand-summary";
import { DashboardCard } from "@/components/dashboard-card";
import { DemandIndexChart } from "@/components/demand-index-chart";
import {
  buildNominalDemandSeries,
  buildRealDemandSeries,
  prepareMixedFrequencyChart,
} from "@/lib/consumer-demand";
import {
  alignedNominalRealGrowthGap,
  buildMetricTrend,
  buildRecreationShareTrend,
  type MetricTrend,
} from "@/lib/consumer-spending-analysis";
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
    totalReal: "au-household-spending-total-real",
    recreationValue: "au-recreation-culture-spending-current-price-sa",
    recreationReal: "au-recreation-culture-spending-real",
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

function formatRate(value: number): string {
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}%`;
}

function formatSnapshotChange(value: number | null): string {
  if (value === null) return "N/A";
  return `${new Intl.NumberFormat("en-US", {
    signDisplay: "always",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

function SourceObservations({
  title,
  description,
  observations,
  locale,
  source,
}: {
  title: string;
  description: string;
  observations: readonly ConsumerSpendingObservation[];
  locale: string;
  source: string;
}) {
  return (
    <details className="group overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/40">
      <summary className="cursor-pointer list-none px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-300">{title}</p>
            <p className="mt-1 text-xs text-zinc-600">{description}</p>
          </div>
          <span className="text-xs text-zinc-500 group-open:hidden">Show</span>
          <span className="hidden text-xs text-zinc-500 group-open:inline">
            Hide
          </span>
        </div>
      </summary>
      <div className="overflow-x-auto border-t border-zinc-800">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="border-b border-zinc-800 text-zinc-600">
            <tr>
              <th className="px-3 py-3 font-medium">Period</th>
              <th className="px-3 py-3 font-medium">Metric</th>
              <th className="px-3 py-3 font-medium">Value</th>
              <th className="px-3 py-3 font-medium">Unit</th>
              <th className="px-3 py-3 font-medium">Frequency</th>
              <th className="px-3 py-3 font-medium">Source</th>
              <th className="px-3 py-3 font-medium">Retrieved</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {observations.map((observation) => (
              <tr key={`${observation.metricSlug}-${observation.periodStart}`}>
                <td className="font-data px-3 py-3 text-zinc-300">
                  {formatPeriod(observation, locale)}
                </td>
                <td className="px-3 py-3 text-zinc-400">
                  {observation.metricName}
                </td>
                <td className="font-data px-3 py-3 text-zinc-200">
                  {formatValue(observation.value, observation.unit, locale)}
                </td>
                <td className="px-3 py-3 text-zinc-500">{observation.unit}</td>
                <td className="px-3 py-3 text-zinc-500 capitalize">
                  {observation.frequency}
                </td>
                <td className="px-3 py-3 text-zinc-500">{source}</td>
                <td className="font-data px-3 py-3 text-zinc-600">
                  {formatTimestamp(observation.retrievedAt, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function snapshotCard(
  country: string,
  nominal: MetricTrend | null,
  real: MetricTrend | null,
) {
  return { country, nominal, real };
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
  const recreationChange = latestObservation(
    australianObservations,
    METRIC_SLUGS.australia.recreationChange,
  );
  const discretionaryChange = latestObservation(
    australianObservations,
    METRIC_SLUGS.australia.discretionaryChange,
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
  const auTotalTrend = buildMetricTrend(
    australianObservations,
    METRIC_SLUGS.australia.total,
    "monthly",
  );
  const auRecreationTrend = buildMetricTrend(
    australianObservations,
    METRIC_SLUGS.australia.recreationValue,
    "monthly",
  );
  const auTotalRealTrend = buildMetricTrend(
    australianObservations,
    METRIC_SLUGS.australia.totalReal,
    "quarterly",
  );
  const auRecreationRealTrend = buildMetricTrend(
    australianObservations,
    METRIC_SLUGS.australia.recreationReal,
    "quarterly",
  );
  const auShare = buildRecreationShareTrend(
    australianObservations,
    METRIC_SLUGS.australia.recreationValue,
    METRIC_SLUGS.australia.total,
    "monthly",
  );
  const ukTotalNominalTrend = buildMetricTrend(
    ukObservations,
    METRIC_SLUGS.unitedKingdom.totalNominal,
    "quarterly",
  );
  const ukTotalRealTrend = buildMetricTrend(
    ukObservations,
    METRIC_SLUGS.unitedKingdom.totalReal,
    "quarterly",
  );
  const ukRecreationNominalTrend = buildMetricTrend(
    ukObservations,
    METRIC_SLUGS.unitedKingdom.recreationNominal,
    "quarterly",
  );
  const ukRecreationRealTrend = buildMetricTrend(
    ukObservations,
    METRIC_SLUGS.unitedKingdom.recreationReal,
    "quarterly",
  );
  const ukShare = buildRecreationShareTrend(
    ukObservations,
    METRIC_SLUGS.unitedKingdom.recreationNominal,
    METRIC_SLUGS.unitedKingdom.totalNominal,
    "quarterly",
  );
  const usTotalNominalTrend = buildMetricTrend(
    beaObservations,
    METRIC_SLUGS.unitedStates.totalNominal,
    "monthly",
  );
  const usTotalRealTrend = buildMetricTrend(
    beaObservations,
    METRIC_SLUGS.unitedStates.totalReal,
    "monthly",
  );
  const usRecreationNominalTrend = buildMetricTrend(
    beaObservations,
    METRIC_SLUGS.unitedStates.recreationNominal,
    "monthly",
  );
  const usRecreationRealTrend = buildMetricTrend(
    beaObservations,
    METRIC_SLUGS.unitedStates.recreationReal,
    "monthly",
  );
  const usShare = buildRecreationShareTrend(
    beaObservations,
    METRIC_SLUGS.unitedStates.recreationNominal,
    METRIC_SLUGS.unitedStates.totalNominal,
    "monthly",
  );
  const caTotalNominalTrend = buildMetricTrend(
    canadianObservations,
    METRIC_SLUGS.canada.totalNominal,
    "quarterly",
  );
  const caTotalRealTrend = buildMetricTrend(
    canadianObservations,
    METRIC_SLUGS.canada.totalReal,
    "quarterly",
  );
  const caRecreationNominalTrend = buildMetricTrend(
    canadianObservations,
    METRIC_SLUGS.canada.recreationNominal,
    "quarterly",
  );
  const caRecreationRealTrend = buildMetricTrend(
    canadianObservations,
    METRIC_SLUGS.canada.recreationReal,
    "quarterly",
  );
  const caShare = buildRecreationShareTrend(
    canadianObservations,
    METRIC_SLUGS.canada.recreationNominal,
    METRIC_SLUGS.canada.totalNominal,
    "quarterly",
  );
  const recentAustralianObservations = australianObservations.slice(0, 24);
  const recentUkObservations = ukObservations.slice(0, 24);
  const recentUsObservations = beaObservations.slice(0, 24);
  const recentCanadianObservations = canadianObservations.slice(0, 24);
  const nominalDemandSeries = buildNominalDemandSeries(data.observations);
  const realDemandSeries = buildRealDemandSeries(data.observations);
  const nominalDemandChart = prepareMixedFrequencyChart(nominalDemandSeries);
  const realDemandChart = prepareMixedFrequencyChart(realDemandSeries);
  const nominalDemandYoYChart = prepareMixedFrequencyChart(
    nominalDemandSeries,
    "year-over-year",
  );
  const realDemandYoYChart = prepareMixedFrequencyChart(
    realDemandSeries,
    "year-over-year",
  );
  const countryRows = {
    australia: [
      {
        label: "Total household spending",
        trend: auTotalTrend,
        locale: "en-AU",
        basis: "Current prices, seasonally adjusted",
        periodLabel: "MoM",
      },
      {
        label: "Recreation & culture",
        trend: auRecreationTrend,
        locale: "en-AU",
        basis: "Current prices, seasonally adjusted",
        officialPeriodChange: recreationChange,
        periodLabel: "MoM",
      },
      {
        label: "Total household spending — real",
        trend: auTotalRealTrend,
        locale: "en-AU",
        basis: "Official ABS chain volume measures, seasonally adjusted",
        periodLabel: "QoQ",
      },
      {
        label: "Recreation & culture — real",
        trend: auRecreationRealTrend,
        locale: "en-AU",
        basis: "Official ABS chain volume measures, seasonally adjusted",
        periodLabel: "QoQ",
      },
    ],
    unitedKingdom: [
      {
        label: "Total household spending — nominal",
        trend: ukTotalNominalTrend,
        locale: "en-GB",
        basis: "Current prices",
      },
      {
        label: "Total household spending — real",
        trend: ukTotalRealTrend,
        locale: "en-GB",
        basis: "Chained volume measure",
      },
      {
        label: "Recreation & culture — nominal",
        trend: ukRecreationNominalTrend,
        locale: "en-GB",
        basis: "Current prices · COICOP 09",
      },
      {
        label: "Recreation & culture — real",
        trend: ukRecreationRealTrend,
        locale: "en-GB",
        basis: "Chained volume measure · COICOP 09",
      },
    ],
    unitedStates: [
      {
        label: "Total PCE — nominal",
        trend: usTotalNominalTrend,
        locale: "en-US",
        basis: "Current dollars, SAAR",
      },
      {
        label: "Total PCE — real",
        trend: usTotalRealTrend,
        locale: "en-US",
        basis: "Chained 2017 dollars, SAAR",
      },
      {
        label: "Recreation services — nominal",
        trend: usRecreationNominalTrend,
        locale: "en-US",
        basis: "Current dollars, SAAR",
      },
      {
        label: "Recreation services — real",
        trend: usRecreationRealTrend,
        locale: "en-US",
        basis: "Chained 2017 dollars, SAAR",
      },
    ],
    canada: [
      {
        label: "Household expenditure — nominal",
        trend: caTotalNominalTrend,
        locale: "en-CA",
        basis: "Current prices",
      },
      {
        label: "Household expenditure — real",
        trend: caTotalRealTrend,
        locale: "en-CA",
        basis: "2017 constant prices",
      },
      {
        label: "Recreation & culture — nominal",
        trend: caRecreationNominalTrend,
        locale: "en-CA",
        basis: "Current prices",
      },
      {
        label: "Recreation & culture — real",
        trend: caRecreationRealTrend,
        locale: "en-CA",
        basis: "2017 constant prices",
      },
    ],
  } satisfies Record<string, DemandSummaryRow[]>;
  const latestDemandSnapshot = [
    snapshotCard("Australia", auRecreationTrend, auRecreationRealTrend),
    snapshotCard(
      "United States",
      usRecreationNominalTrend,
      usRecreationRealTrend,
    ),
    snapshotCard(
      "United Kingdom",
      ukRecreationNominalTrend,
      ukRecreationRealTrend,
    ),
    snapshotCard("Canada", caRecreationNominalTrend, caRecreationRealTrend),
  ];
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
            yearOverYearData={nominalDemandYoYChart}
            series={nominalDemandSeries}
          />
        </DashboardCard>
        <DashboardCard
          title="Recreation Demand — Real Index"
          description="Baseline = 100 at first available 2019 observation"
        >
          <DemandIndexChart
            data={realDemandChart}
            yearOverYearData={realDemandYoYChart}
            series={realDemandSeries}
          />
        </DashboardCard>
      </div>

      <DashboardCard
        title="Latest Recreation Demand"
        description="Each market uses its own latest published period"
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {latestDemandSnapshot.map((item) => (
            <div
              key={item.country}
              className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4"
            >
              <p className="text-sm font-medium text-zinc-200">
                {item.country}
              </p>
              <p className="mt-1 text-[11px] text-zinc-600">
                {item.nominal
                  ? formatPeriod(item.nominal.current)
                  : "No current observation"}
              </p>
              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-zinc-500">Nominal YoY</dt>
                  <dd className="font-data text-zinc-200">
                    {formatSnapshotChange(
                      item.nominal?.yearOverYearChange ?? null,
                    )}
                  </dd>
                </div>
                <div className="text-[10px] text-zinc-700">
                  {item.nominal
                    ? `Nominal: ${formatPeriod(item.nominal.current)}`
                    : "Nominal period unavailable"}
                  {item.real
                    ? ` · Real: ${formatPeriod(item.real.current)}`
                    : " · Real period unavailable"}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-zinc-500">Real YoY</dt>
                  <dd className="font-data text-zinc-200">
                    {formatSnapshotChange(
                      item.real?.yearOverYearChange ?? null,
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </DashboardCard>

      <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-xs leading-5 text-zinc-500">
        Indexing makes unlike currency levels easier to compare, but source
        definitions remain distinct: ABS and ONS cover recreation and culture,
        BEA covers recreation services, and Statistics Canada covers recreation
        and culture. Nominal and real measures are shown separately. The annual
        EU structural benchmark is excluded from this current-demand comparison.
      </p>

      <CountryDemandSummary
        country="Australia"
        description="Monthly, seasonally adjusted ABS household-spending indicators"
        rows={countryRows.australia}
        share={auShare}
        shareLabel="Recreation & culture share of household spending"
        source="ABS"
        sourceSemantics="current prices; official recreation MoM retained"
        periodLabel="MoM"
        realUnavailable="Nominal indicators are monthly while official ABS chain-volume indicators are quarterly. No mixed-period nominal-real gap is calculated."
        ancillarySignal={{
          label: "Discretionary spending signal",
          observation: discretionaryChange,
          description: "ABS-published monthly change; not a dollar level",
        }}
      />

      <SourceObservations
        title="Show Australian source observations"
        description="Latest persisted ABS HSI_M records"
        observations={recentAustralianObservations}
        locale="en-AU"
        source="ABS"
      />

      <CountryDemandSummary
        country="Canada"
        description="Quarterly Statistics Canada household consumption"
        rows={countryRows.canada}
        share={caShare}
        shareLabel="Recreation & culture share of household spending"
        source="Statistics Canada"
        sourceSemantics="seasonally adjusted at quarterly rates; not SAAR"
        periodLabel="QoQ"
        nominalRealGap={alignedNominalRealGrowthGap(
          caRecreationNominalTrend,
          caRecreationRealTrend,
        )}
      />

      <SourceObservations
        title="Show Canadian source observations"
        description="Latest persisted table 36-10-0124-01 records"
        observations={recentCanadianObservations}
        locale="en-CA"
        source="Statistics Canada"
      />

      <CountryDemandSummary
        country="United Kingdom"
        description="Quarterly, seasonally adjusted ONS Consumer Trends"
        rows={countryRows.unitedKingdom}
        share={ukShare}
        shareLabel="Recreation & culture share of household spending"
        source="ONS"
        sourceSemantics="current prices and chained volume measures"
        periodLabel="QoQ"
        nominalRealGap={alignedNominalRealGrowthGap(
          ukRecreationNominalTrend,
          ukRecreationRealTrend,
        )}
      />

      <SourceObservations
        title="Show UK source observations"
        description="Latest persisted ONS CT quarterly records"
        observations={recentUkObservations}
        locale="en-GB"
        source="ONS"
      />

      <CountryDemandSummary
        country="United States"
        description="Monthly BEA personal-consumption demand"
        rows={countryRows.unitedStates}
        share={usShare}
        shareLabel="Recreation services share of total PCE"
        source="BEA"
        sourceSemantics="seasonally adjusted annual rates"
        periodLabel="MoM"
        nominalRealGap={alignedNominalRealGrowthGap(
          usRecreationNominalTrend,
          usRecreationRealTrend,
        )}
      />

      <p className="rounded-xl border border-blue-900/30 bg-blue-950/10 px-4 py-3 text-xs leading-5 text-zinc-500">
        SAAR = seasonally adjusted annual rate. Monthly BEA values show the
        annualized spending pace implied by that month, not the amount spent
        during the month itself. Consecutive SAAR levels can be compared as
        growth rates and are not divided by twelve.
      </p>

      <SourceObservations
        title="Show US consumption source observations"
        description="Latest persisted BEA NIPA monthly records"
        observations={recentUsObservations}
        locale="en-US"
        source="BEA"
      />

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
