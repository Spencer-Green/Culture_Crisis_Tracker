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
import { getGdeltCorpusOverview } from "@/services/industry-events/events";
import { getTicketmasterCrossSectorTrends } from "@/services/industry-events/ticketmaster-longitudinal";
import { getTicketmasterSupplyOverview } from "@/services/industry-events/ticketmaster-supply";
import { getGamingOverview } from "@/services/gaming/analytics";

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

function formatSupplyDelta(value: number | null): string {
  if (value === null) return "Insufficient history";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
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
  const [
    overview,
    consumerSpending,
    gdeltCorpus,
    ticketmasterSupply,
    crossSectorTrends,
    gamingOverview,
  ] = await Promise.all([
    getOverviewState(),
    getConsumerSpendingData(),
    getGdeltCorpusOverview(),
    getTicketmasterSupplyOverview(),
    getTicketmasterCrossSectorTrends(),
    getGamingOverview(),
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
      status:
        ticketmasterSupply.summary.events > 0
          ? "Collecting supply data"
          : gdeltCorpus.stats.total > 0
            ? "Collecting evidence"
            : "Pending",
      detail:
        ticketmasterSupply.summary.events > 0
          ? "Ticketmaster forward supply active; no score"
          : gdeltCorpus.stats.total > 0
            ? "GDELT candidate corpus active; no score"
            : "No media-event candidates",
      tone:
        ticketmasterSupply.summary.events > 0 || gdeltCorpus.stats.total > 0
          ? "text-blue-300"
          : "text-zinc-300",
    },
    {
      title: "Middle-Tier Health",
      status: "Pending",
      detail: "No observations",
      tone: "text-zinc-300",
    },
    {
      title: "Gaming",
      status:
        gamingOverview.trackedGames > 0 ? "Collecting market data" : "Pending",
      detail:
        gamingOverview.trackedGames > 0
          ? `${gamingOverview.trackedGames.toLocaleString()} releases · ${gamingOverview.steamMappedGames.toLocaleString()} Steam mapped`
          : "No structured game records",
      tone: gamingOverview.trackedGames > 0 ? "text-blue-300" : "text-zinc-300",
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
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
          description="Structured supply and media candidates; no viability score"
        >
          {ticketmasterSupply.summary.events > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Events · 30d", ticketmasterSupply.summary.events],
                  ["Venues", ticketmasterSupply.summary.venues],
                  [
                    "Cancelled",
                    (ticketmasterSupply.summary.statuses.cancelled ?? 0) +
                      (ticketmasterSupply.summary.statuses.canceled ?? 0),
                  ],
                  [
                    "Price ranges",
                    ticketmasterSupply.summary.priceCoveragePercent === null
                      ? "N/A"
                      : `${ticketmasterSupply.summary.priceCoveragePercent.toFixed(1)}%`,
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
                  >
                    <p className="text-xs text-zinc-500">{label}</p>
                    <p className="font-data mt-2 text-xl text-zinc-100">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-xs leading-5 text-zinc-600">
                Ticketmaster-covered supply is a current forward snapshot, not a
                historical trend or market-wide census. GDELT retrieval remains
                upstream-blocked when no candidates are present.
              </p>
            </div>
          ) : gdeltCorpus.stats.total > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Candidates · 30d", gdeltCorpus.stats.total],
                  ["Negative", gdeltCorpus.stats.negative],
                  ["Positive", gdeltCorpus.stats.positive],
                  ["High confidence", gdeltCorpus.stats.highConfidence],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
                  >
                    <p className="text-xs text-zinc-500">{label}</p>
                    <p className="font-data mt-2 text-xl text-zinc-100">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-xs leading-5 text-zinc-600">
                Article candidates are not confirmed business outcomes. Raw
                media volume is not treated as a trend or score.
              </p>
            </div>
          ) : (
            <EmptyChart label="Industry viability evidence corpus" />
          )}
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
          {crossSectorTrends.hasComparableHistory ? (
            <div className="space-y-3">
              {crossSectorTrends.sectors.map((sector) => (
                <div
                  key={sector.segmentName}
                  className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-zinc-200">
                      {sector.segmentName}
                    </p>
                    <span className="font-data text-xs text-zinc-500">90D</span>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <dt className="text-zinc-600">Supply</dt>
                      <dd className="font-data mt-1 text-zinc-300">
                        {formatSupplyDelta(
                          sector.comparison?.eventCountPctChange ?? null,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-600">Venues</dt>
                      <dd className="font-data mt-1 text-zinc-300">
                        {formatSupplyDelta(
                          sector.comparison?.activeVenuePctChange ?? null,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-600">Events / venue</dt>
                      <dd className="font-data mt-1 text-zinc-300">
                        {formatSupplyDelta(
                          sector.comparison?.eventsPerVenuePctChange ?? null,
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
              <p className="text-xs leading-5 text-zinc-600">
                Equivalent Ticketmaster 90-day snapshots only. These are supply
                changes, not an Industry Viability score.
              </p>
            </div>
          ) : (
            <div className="flex min-h-36 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50 px-6 text-center">
              <p className="text-sm font-medium text-zinc-300">
                Cross-sector comparison
              </p>
              <p className="mt-2 text-xs text-zinc-600">
                Collecting longitudinal history. Comparable Music, Arts &amp;
                Theatre, and Film changes will appear after another complete
                90-day snapshot.
              </p>
            </div>
          )}
        </DashboardCard>
        <DashboardCard
          title="Latest Industry Events"
          description="Newest unreviewed GDELT article candidates"
        >
          {gdeltCorpus.latest.length > 0 ? (
            <ul className="space-y-3">
              {gdeltCorpus.latest.map((candidate) => (
                <li
                  key={candidate.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
                >
                  <p className="text-xs text-blue-300">GDELT candidate</p>
                  <a
                    href={candidate.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block text-sm leading-5 text-zinc-200 hover:text-blue-300"
                  >
                    {candidate.title}
                  </a>
                  <p className="mt-2 text-xs text-zinc-600">
                    {candidate.eventType.replaceAll("_", " ").toLowerCase()} ·{" "}
                    {candidate.confidenceLevel} confidence
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyList message="No industry-event candidates have been ingested" />
          )}
        </DashboardCard>
      </div>
    </div>
  );
}
