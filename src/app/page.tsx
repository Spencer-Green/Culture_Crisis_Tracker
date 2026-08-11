import {
  DashboardCard,
  EmptyChart,
  EmptyList,
} from "@/components/dashboard-card";
import { getConsumerSpendingData } from "@/services/consumer-spending";
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
  if (overview.databaseStatus === "unavailable") {
    return (
      <div className="rounded-xl border border-dashed border-amber-900/60 px-5 py-10 text-center">
        <p className="text-sm text-amber-200/80">
          Source freshness is temporarily unavailable.
        </p>
      </div>
    );
  }

  if (overview.sourceFreshness.length === 0) {
    return <EmptyList message="No sources have completed a successful sync" />;
  }

  return (
    <ul className="space-y-3">
      {overview.sourceFreshness.map((source) => (
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

export default async function OverviewPage() {
  const [overview, consumerSpending] = await Promise.all([
    getOverviewState(),
    getConsumerSpendingData(),
  ]);
  const consumerDemandActive = consumerSpending.observations.length > 0;
  const consumerSourceCount = new Set(
    consumerSpending.observations.map((observation) => observation.sourceSlug),
  ).size;
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
        ? `${consumerSourceCount} household-spending ${
            consumerSourceCount === 1 ? "source" : "sources"
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
          title="Consumer Demand"
          description="Recreation and culture spending over time"
        >
          <EmptyChart
            label={
              consumerDemandActive
                ? `${consumerSourceCount} consumer-spending ${
                    consumerSourceCount === 1 ? "source" : "sources"
                  } available`
                : "Consumer demand series"
            }
            message={
              consumerDemandActive
                ? consumerSourceCount > 1
                  ? "Cross-market visualisation pending"
                  : "Cross-market visualisation pending additional sources"
                : "No validated consumer-spending observations available"
            }
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
          description="Australia, US, UK, Canada, New Zealand, and EU"
          className="xl:col-span-2"
        >
          <EmptyChart label="Comparable country indicators" />
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
