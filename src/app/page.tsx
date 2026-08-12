import {
  DashboardCard,
  EmptyChart,
  EmptyList,
} from "@/components/dashboard-card";
import { DemandIndexChart } from "@/components/demand-index-chart";
import {
  buildNominalDemandSeries,
  prepareMixedFrequencyChart,
  type IndexedDemandSeries,
} from "@/lib/consumer-demand";
import { getConsumerSpendingData } from "@/services/consumer-spending";
import { isCurrentSource } from "@/data-sources/source-role";
import type { OverviewState, SourceFreshness } from "@/services/overview-core";
import { getOverviewState } from "@/services/overview";

export const dynamic = "force-dynamic";

function formatTimestamp(value: string | null, emptyMessage: string): string {
  if (!value) {
    return emptyMessage;
  }

  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatObservationPeriod(
  period: SourceFreshness["latestObservationPeriod"],
): string {
  if (!period) {
    return "Not available";
  }

  const periodStart = new Date(period.start);
  const periodEnd = new Date(period.end);
  if (
    periodStart.getUTCMonth() === 0 &&
    periodStart.getUTCDate() === 1 &&
    periodEnd.getUTCMonth() === 11 &&
    periodEnd.getUTCDate() === 31
  ) {
    return `${periodStart.getUTCFullYear()} · annual`;
  }

  const formatter = new Intl.DateTimeFormat("en-AU", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const start = formatter.format(new Date(period.start));
  const end = formatter.format(new Date(period.end));

  return start === end ? start : `${start} – ${end}`;
}

function DataFreshness({ overview }: { overview: OverviewState }) {
  const currentSources = overview.sourceFreshness.filter((source) =>
    isCurrentSource(source.slug),
  );
  if (overview.databaseStatus === "unavailable") {
    return (
      <div className="rounded-xl border border-dashed border-amber-900/60 px-5 py-10 text-center">
        <p className="text-sm text-amber-200/80">
          Source freshness is temporarily unavailable.
        </p>
      </div>
    );
  }

  if (currentSources.length === 0) {
    return <EmptyList message="No sources have completed a successful sync" />;
  }

  return (
    <ul className="space-y-3">
      {currentSources.map((source) => (
        <li
          key={source.slug}
          className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4"
        >
          <p className="text-sm font-medium text-zinc-200">{source.name}</p>
          <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-1">
            <div>
              <dt className="text-zinc-600">Latest observation period</dt>
              <dd className="font-data mt-1 text-zinc-300">
                {formatObservationPeriod(source.latestObservationPeriod)}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-600">Last successful ingestion</dt>
              <dd className="font-data mt-1 text-zinc-300">
                {formatTimestamp(
                  source.lastSuccessfulIngestionAt,
                  "Not available",
                )}
              </dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

function CountryComparison({ series }: { series: IndexedDemandSeries[] }) {
  const validated = series.filter((item) => item.points.length > 0);
  const pending = ["New Zealand"];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium text-zinc-300">
          Validated consumer-demand data
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {validated.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-emerald-900/50 bg-emerald-950/15 p-4"
            >
              <p className="text-sm font-medium text-emerald-200">
                {item.country}
              </p>
              <p className="mt-1 text-xs text-emerald-300/60">
                {item.source} · {item.points[0].frequency}
              </p>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-zinc-400">
          Structural benchmark
        </p>
        <div className="mt-3 rounded-xl border border-amber-900/40 bg-amber-950/10 p-4">
          <p className="text-sm font-medium text-amber-200">European Union</p>
          <p className="mt-1 text-xs leading-5 text-amber-300/60">
            Eurostat annual national-accounts data is retained for historical
            context, not treated as a current demand signal.
          </p>
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-zinc-400">Coverage pending</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {pending.map((country) => (
            <span
              key={country}
              className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-500"
            >
              {country}
            </span>
          ))}
        </div>
      </div>
      <p className="text-xs leading-5 text-zinc-600">
        Current coverage supports indexed demand comparison, not direct
        currency-level or definition-level equivalence.
      </p>
    </div>
  );
}

export default async function OverviewPage() {
  const [overview, consumerSpending] = await Promise.all([
    getOverviewState(),
    getConsumerSpendingData(),
  ]);
  const currentObservations = consumerSpending.observations.filter(
    (observation) => isCurrentSource(observation.sourceSlug),
  );
  const consumerDemandActive = currentObservations.length > 0;
  const consumerMarketCount = new Set(
    currentObservations
      .map((observation) => observation.countryCode)
      .filter((countryCode) => countryCode !== null),
  ).size;
  const nominalDemandSeries = buildNominalDemandSeries(currentObservations);
  const nominalDemandChart = prepareMixedFrequencyChart(nominalDemandSeries);
  const indicators = [
    {
      title: "Culture Stress Index",
      status: "Pending",
      detail: "Composite methodology pending",
      tone: "text-blue-300",
    },
    {
      title: "Consumer Demand",
      status: consumerDemandActive ? "Active" : "Pending",
      detail: consumerDemandActive
        ? `${consumerMarketCount} current consumer-demand ${
            consumerMarketCount === 1 ? "market" : "markets"
          } online`
        : "No observations",
      tone: consumerDemandActive ? "text-emerald-300" : "text-zinc-300",
    },
    {
      title: "Industry Viability",
      status: "Pending",
      detail: "No observations",
      tone: "text-zinc-300",
    },
    {
      title: "Middle-Tier Health",
      status: "Pending",
      detail: "No observations",
      tone: "text-zinc-300",
    },
    {
      title: "AI Disruption",
      status: "Pending",
      detail: "No policy events",
      tone: "text-zinc-300",
    },
  ];
  const contributingSourceCount = overview.contributingSourceCount;
  const ingestionState =
    overview.databaseStatus === "unavailable"
      ? {
          title: "Ingestion status unavailable",
          detail:
            "Persisted ingestion state could not be loaded. No fallback values are being presented.",
          containerTone: "border-amber-900/50 bg-amber-950/20",
          dotTone: "bg-amber-400",
          titleTone: "text-amber-100",
          detailTone: "text-amber-200/60",
        }
      : contributingSourceCount > 0
        ? {
            title: "Partial ingestion active",
            detail: `${contributingSourceCount} ${
              contributingSourceCount === 1 ? "source is" : "sources are"
            } currently contributing validated observations. Broader Western-market coverage is still being built.`,
            containerTone: "border-blue-900/50 bg-blue-950/20",
            dotTone: "bg-blue-400",
            titleTone: "text-blue-100",
            detailTone: "text-blue-200/60",
          }
        : {
            title: "No successful ingestion yet",
            detail:
              "Validated observation panels will activate after a source completes ingestion.",
            containerTone: "border-blue-900/50 bg-blue-950/20",
            dotTone: "bg-blue-400",
            titleTone: "text-blue-100",
            detailTone: "text-blue-200/60",
          };
  const lastRefresh =
    overview.databaseStatus === "unavailable"
      ? "Unavailable"
      : formatTimestamp(
          overview.latestSuccessfulIngestionAt,
          "Not yet available",
        );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-data text-xs tracking-[0.2em] text-blue-400 uppercase">
            Overview
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
            Cultural economy pulse
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            A comparative view of demand, viability, concentration, and
            disruption across six Western markets.
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-500">
          Last refresh:{" "}
          <span className="font-data text-zinc-300">{lastRefresh}</span>
        </div>
      </div>

      <div className={`rounded-2xl border p-5 ${ingestionState.containerTone}`}>
        <div className="flex gap-3">
          <span
            className={`mt-1 size-2 shrink-0 rounded-full ${ingestionState.dotTone}`}
            aria-hidden="true"
          />
          <div>
            <h2 className={`text-sm font-medium ${ingestionState.titleTone}`}>
              {ingestionState.title}
            </h2>
            <p
              className={`mt-1 text-sm leading-6 ${ingestionState.detailTone}`}
            >
              {ingestionState.detail}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {indicators.map((indicator) => (
          <section
            key={indicator.title}
            className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 transition-colors duration-200 hover:border-zinc-700"
          >
            <p className="text-xs text-zinc-500">{indicator.title}</p>
            <p className={`mt-4 text-lg font-medium ${indicator.tone}`}>
              {indicator.status}
            </p>
            <p className="mt-1 text-xs text-zinc-600">{indicator.detail}</p>
          </section>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardCard
          title="Recreation & Culture Demand — Nominal Index"
          description="Baseline = 100 at first available 2019 observation"
        >
          <DemandIndexChart
            data={nominalDemandChart}
            series={nominalDemandSeries}
            emptyMessage="No validated recreation-demand observations are available."
          />
        </DashboardCard>
        <DashboardCard
          title="Industry Viability"
          description="Closures, cancellations, employment, and operating health"
        >
          <EmptyChart label="Industry viability trend" />
        </DashboardCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <DashboardCard
          title="Country Comparison"
          description="Current demand coverage with EU structural context"
          className="xl:col-span-2"
        >
          <CountryComparison series={nominalDemandSeries} />
        </DashboardCard>
        <DashboardCard title="Data Freshness" description="Recency by source">
          <DataFreshness overview={overview} />
        </DashboardCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardCard
          title="Sector Comparison"
          description="Demand and viability signals by cultural sector"
        >
          <EmptyChart label="Cross-sector comparison" />
        </DashboardCard>
        <DashboardCard
          title="Latest Industry Events"
          description="Closures, cancellations, layoffs, policy, and consolidation"
        >
          <EmptyList message="No industry events have been ingested" />
        </DashboardCard>
      </div>
    </div>
  );
}
