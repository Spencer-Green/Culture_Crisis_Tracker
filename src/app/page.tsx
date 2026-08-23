import { DashboardCard, EmptyList } from "@/components/dashboard-card";
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
import { DailyBriefOverview } from "@/components/daily-culture-brief";
import { getDailyCultureBrief } from "@/services/media/daily-brief";
import { getOverviewAnalytics } from "@/services/overview-analytics";
import type {
  AiDisruptionDirection,
  AnalyticalDirection,
  IndustryViability,
} from "@/services/overview-analytics-core";

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

function analyticalTone(direction: AnalyticalDirection): string {
  if (direction === "improving") return "text-emerald-300";
  if (direction === "pressured") return "text-rose-300";
  if (direction === "mixed") return "text-amber-300";
  if (direction === "stable") return "text-blue-300";
  return "text-zinc-400";
}

function directionLabel(direction: AnalyticalDirection): string {
  return {
    improving: "Improving",
    stable: "Stable",
    pressured: "Pressured",
    mixed: "Mixed",
    insufficient: "Insufficient history",
  }[direction];
}

function aiDirectionSymbol(direction: AiDisruptionDirection): string {
  return direction === "increasing"
    ? "↑"
    : direction === "easing"
      ? "↓"
      : direction === "stable"
        ? "→"
        : "";
}

function IndustryViabilityPanel({
  viability,
}: {
  viability: IndustryViability;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-zinc-500">Current breadth</p>
          <p className="mt-1 text-xl font-medium text-zinc-100">
            {viability.label}
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            {viability.directionLabel}
          </p>
        </div>
        <p className="font-data text-xs text-zinc-500">
          {viability.coveredSectorCount} viability sectors covered
        </p>
      </div>
      <div className="space-y-3">
        {viability.sectors.map((sector) => (
          <section
            key={sector.sector}
            className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-zinc-200">
                  {sector.label}
                </p>
                <p className="mt-1 text-[11px] text-zinc-600">
                  {sector.basis === "activity-proxy"
                    ? "Activity / supply proxy; excluded from cross-sector viability breadth"
                    : `${sector.comparableComponentCount} comparable source ${sector.comparableComponentCount === 1 ? "signal" : "signals"}`}
                </p>
              </div>
              <span
                className={`text-xs font-medium ${analyticalTone(sector.direction)}`}
              >
                {directionLabel(sector.direction)}
              </span>
            </div>
            <ul className="mt-3 space-y-2">
              {sector.components.map((component) => (
                <li
                  key={component.id}
                  className="flex flex-col gap-1 border-t border-zinc-900 pt-2 text-xs first:border-0 first:pt-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                >
                  <div>
                    <p className="text-zinc-400">{component.label}</p>
                    <p className="mt-0.5 text-[10px] text-zinc-700">
                      {component.geography} · {component.frequency}
                    </p>
                    <p className="mt-0.5 leading-5 text-zinc-600">
                      {component.detail}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 ${analyticalTone(component.direction)}`}
                  >
                    {directionLabel(component.direction)}
                    {component.freshness === "degraded" ? " · degraded" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="text-xs leading-5 text-zinc-600">
        Source-level directions use like-for-like changes and transparent
        neutral bands. Raw percentages are not averaged. Gaming release supply
        is shown separately and does not count as economic viability.
      </p>
    </div>
  );
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
    crossSectorTrends,
    dailyBrief,
    overviewAnalytics,
  ] = await Promise.all([
    getOverviewState(),
    getConsumerSpendingData(),
    getGdeltCorpusOverview(),
    getTicketmasterCrossSectorTrends(),
    getDailyCultureBrief({ includeMarketContext: false }),
    getOverviewAnalytics(),
  ]);
  const schedulerFreshness = dailyBrief.schedulerFreshness;
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
      status: overviewAnalytics.industryViability.label,
      detail: `${overviewAnalytics.industryViability.pressuredSectorCount} pressured · ${overviewAnalytics.industryViability.improvingSectorCount} improving · ${overviewAnalytics.industryViability.mixedSectorCount} mixed · ${overviewAnalytics.industryViability.coveredSectorCount} sectors${overviewAnalytics.industryViability.degradedComponentCount > 0 ? ` · ${overviewAnalytics.industryViability.degradedComponentCount} sources degraded` : ""}`,
      tone:
        overviewAnalytics.industryViability.state === "broadly-improving"
          ? "text-emerald-300"
          : overviewAnalytics.industryViability.state === "broadly-pressured"
            ? "text-rose-300"
            : overviewAnalytics.industryViability.state === "mixed"
              ? "text-amber-300"
              : "text-blue-300",
    },
    {
      title: "Middle-Tier Health",
      status: "Pending",
      detail: overviewAnalytics.middleTier.label,
      tone: "text-zinc-300",
    },
    {
      title: "Gaming",
      status: overviewAnalytics.gaming
        ? overviewAnalytics.gaming.direction === "improving"
          ? "Release activity rising"
          : overviewAnalytics.gaming.direction === "pressured"
            ? "Release activity lower"
            : "Release activity stable"
        : "Pending",
      detail: overviewAnalytics.gaming
        ? `${overviewAnalytics.gaming.latestTwelveMonthReleases.toLocaleString()} latest 12M · ${formatSupplyDelta(overviewAnalytics.gaming.changePct)} · ${overviewAnalytics.gaming.upcoming90.toLocaleString()} upcoming 90D${overviewAnalytics.gaming.freshness === "degraded" ? " · degraded freshness" : ""}`
        : "No structured game records",
      tone: overviewAnalytics.gaming
        ? analyticalTone(overviewAnalytics.gaming.direction)
        : "text-zinc-300",
    },
    {
      title: "AI Disruption",
      status:
        `${overviewAnalytics.aiDisruption.state} ${aiDirectionSymbol(overviewAnalytics.aiDisruption.direction)}`.trim(),
      detail: `${overviewAnalytics.aiDisruption.clusterCount} qualifying clusters · ${overviewAnalytics.aiDisruption.sectorBreadth} sectors · 7-day signal${overviewAnalytics.aiFreshness === "degraded" ? " · freshness degraded" : ""}`,
      tone:
        overviewAnalytics.aiDisruption.state === "HIGH"
          ? "text-rose-300"
          : overviewAnalytics.aiDisruption.state === "ELEVATED"
            ? "text-amber-300"
            : overviewAnalytics.aiDisruption.state === "MODERATE"
              ? "text-blue-300"
              : "text-emerald-300",
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

      {schedulerFreshness.databaseStatus === "available" ? (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-200">
                Data freshness
              </p>
              <p className="mt-1 text-xs text-zinc-600">
                Refresh recency is separate from the latest published source
                period.
              </p>
            </div>
            <div className="grid grid-cols-5 gap-4 text-center">
              {[
                [
                  "Current",
                  schedulerFreshness.summary.CURRENT +
                    schedulerFreshness.summary.DUE_SOON,
                ],
                [
                  "Due / late",
                  schedulerFreshness.summary.STALE +
                    schedulerFreshness.summary.OVERDUE,
                ],
                ["Structural", schedulerFreshness.summary.STRUCTURAL],
                ["Blocked", schedulerFreshness.summary.BLOCKED],
                ["Failed", schedulerFreshness.summary.FAILED_RECENTLY],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="font-data text-lg text-zinc-100">{value}</p>
                  <p className="text-[10px] text-zinc-600">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

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

      <DailyBriefOverview brief={dailyBrief} />

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
          description="Comparable demand, participation, and business-viability breadth; no composite score"
        >
          <IndustryViabilityPanel
            viability={overviewAnalytics.industryViability}
          />
        </DashboardCard>
      </div>

      <DashboardCard
        title="AI Creative Disruption — 7-Day Evidence"
        description="Deterministic story-cluster signal; article volume is deduplicated"
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Current state", overviewAnalytics.aiDisruption.state],
              [
                "Direction",
                overviewAnalytics.aiDisruption.direction.replaceAll("-", " "),
              ],
              ["Story clusters", overviewAnalytics.aiDisruption.clusterCount],
              [
                "Cultural sectors",
                overviewAnalytics.aiDisruption.sectorBreadth,
              ],
              [
                "Previous 7D",
                overviewAnalytics.aiDisruption.previousClusterCount,
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
              >
                <p className="text-xs text-zinc-500">{label}</p>
                <p className="font-data mt-2 text-lg text-zinc-100 capitalize">
                  {value}
                </p>
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-xs text-zinc-500">
                Rights, policy, and labour
              </p>
              <p className="font-data mt-2 text-xl text-zinc-100">
                {overviewAnalytics.aiDisruption.rightsPolicyLaborCount}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-xs text-zinc-500">
                Adoption and creator tools
              </p>
              <p className="font-data mt-2 text-xl text-zinc-100">
                {overviewAnalytics.aiDisruption.adoptionToolCount}
              </p>
            </div>
          </div>
          <p className="text-xs leading-5 text-zinc-600">
            Each story cluster contributes once. Internal thresholding weights
            corrected importance, confidence, disruption type, recency, and a
            capped corroboration factor (current evidence weight{" "}
            {overviewAnalytics.aiDisruption.score.toFixed(1)}). Human
            corrections route this analytical view without changing stored
            machine classifications.
            {overviewAnalytics.aiDisruption.baselineLimited
              ? " The preceding-window AI baseline is limited."
              : ""}
            {overviewAnalytics.aiFreshness === "degraded"
              ? " RSS or TheNewsAPI refresh is overdue or recently failed; the last valid result is retained with degraded coverage."
              : ""}
          </p>
        </div>
      </DashboardCard>

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
