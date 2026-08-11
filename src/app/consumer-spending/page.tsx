import type { Metadata } from "next";

import { DashboardCard } from "@/components/dashboard-card";
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
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return value;
  }

  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(numericValue);
  return unit === "percent" ? `${formatted}%` : formatted;
}

function MetricValue({
  observation,
  emptyMessage,
  locale = "en-AU",
  provenance,
}: {
  observation: ConsumerSpendingObservation | undefined;
  emptyMessage: string;
  locale?: string;
  provenance: string;
}) {
  if (!observation) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 px-5 py-10 text-center">
        <p className="text-sm text-zinc-400">{emptyMessage}</p>
        <p className="mt-1 text-xs text-zinc-600">
          Run the ABS ingestion command to populate this metric.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="font-data text-3xl text-zinc-50">
        {formatValue(observation.value, observation.unit, locale)}
      </p>
      <p className="mt-2 text-xs text-zinc-500">{observation.unit}</p>
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

export default async function ConsumerSpendingPage() {
  const data = await getConsumerSpendingData();
  const australianObservations = data.observations.filter(
    (observation) => observation.sourceSlug === "abs",
  );
  const ukObservations = data.observations.filter(
    (observation) => observation.sourceSlug === "ons",
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
  const recentAustralianObservations = australianObservations.slice(0, 24);
  const recentUkObservations = ukObservations.slice(0, 24);

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
            Persisted monthly Australian and quarterly UK observations. No
            synthetic fallback values or currency conversions are displayed.
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
        </div>
      </div>

      {data.databaseStatus === "unavailable" ? (
        <div className="rounded-2xl border border-amber-900/50 bg-amber-950/20 p-5 text-sm text-amber-200/80">
          Consumer spending data is temporarily unavailable because the database
          could not be reached.
        </div>
      ) : null}

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
    </div>
  );
}
