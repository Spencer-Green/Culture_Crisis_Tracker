import type { Metadata } from "next";

import { BeaMusicDemandChart } from "@/components/bea-music-demand-chart";
import { BEAACPSAMusicChart } from "@/components/bea-acpsa-music-chart";
import { DashboardCard, EmptyChart } from "@/components/dashboard-card";
import { MediaArticleList } from "@/components/media-article-list";
import { MVTViabilityChart } from "@/components/mvt-viability-chart";
import {
  TicketmasterMusicTrendChart,
  type TicketmasterMusicTrendPoint,
} from "@/components/ticketmaster-music-trend-chart";
import { getTicketmasterSupplyTrends } from "@/services/industry-events/ticketmaster-longitudinal";
import { getTicketmasterSupply } from "@/services/industry-events/ticketmaster-supply";
import { getRecentMediaDevelopments } from "@/services/media/media";
import { getMusicSectorData } from "@/services/music/music";
import { formatPublishedValue } from "@/lib/source-value-format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Music" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const COUNTRIES = ["US", "GB", "AU", "CA"] as const;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function integer(value: number | null) {
  return value === null ? "Unavailable" : Math.round(value).toLocaleString();
}

function percent(value: number | null, suffix = "%") {
  if (value === null) return "Insufficient history";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;
}

function moneyGbp(value: number | null) {
  if (value === null) return "Unavailable";
  if (value >= 1_000_000_000) return `£${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `£${(value / 1_000_000).toFixed(1)}M`;
  return `£${value.toLocaleString("en-GB")}`;
}

function moneyUsd(value: number | null) {
  if (value === null) return "Unavailable";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function monthLabel(periodStart: string | null | undefined) {
  if (!periodStart) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(periodStart));
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="font-data mt-2 text-xl font-semibold text-zinc-100">
        {value}
      </p>
      {detail ? <p className="mt-1 text-xs text-zinc-600">{detail}</p> : null}
    </div>
  );
}

function transitionsByDestination(
  values: Record<string, number> | null,
  destination: string,
) {
  if (!values) return null;
  return Object.entries(values)
    .filter(([key]) => key.endsWith(`→ ${destination}`))
    .reduce((sum, [, count]) => sum + count, 0);
}

export default async function MusicPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const requestedCountry = first(params.country);
  const country = COUNTRIES.includes(
    requestedCountry as (typeof COUNTRIES)[number],
  )
    ? (requestedCountry as (typeof COUNTRIES)[number])
    : "US";
  const [mvt, supply30, supply90, trends30, trends90, developments] =
    await Promise.all([
      getMusicSectorData(),
      getTicketmasterSupply({
        days: 30,
        countryCode: country,
        segmentName: "Music",
      }),
      getTicketmasterSupply({
        days: 90,
        countryCode: country,
        segmentName: "Music",
      }),
      getTicketmasterSupplyTrends({
        windowDays: 30,
        countryCode: country,
        segmentName: "Music",
      }),
      getTicketmasterSupplyTrends({
        windowDays: 90,
        countryCode: country,
        segmentName: "Music",
      }),
      getRecentMediaDevelopments("music"),
    ]);
  const trend30 = trends30.entries[0];
  const trend90 = trends90.entries[0];
  const transitions = trend90.transitionCounts ?? trend30.transitionCounts;
  const trendPoints = new Map<string, TicketmasterMusicTrendPoint>();
  for (const [window, entry] of [
    [30, trend30],
    [90, trend90],
  ] as const) {
    for (const snapshot of [entry.previous, entry.latest]) {
      if (!snapshot) continue;
      const key = snapshot.capturedAt.toISOString().slice(0, 10);
      const point = trendPoints.get(key) ?? {
        capturedAt: key,
        events30: null,
        events90: null,
      };
      if (window === 30) point.events30 = snapshot.uniqueEventCount;
      else point.events90 = snapshot.uniqueEventCount;
      trendPoints.set(key, point);
    }
  }
  const mvtAnalytics = mvt.analytics;
  const beaDemand = mvt.beaDemand;
  const censusIndustry = mvt.censusIndustry;
  const acpsaStructure = mvt.acpsaStructure;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-data text-xs tracking-[0.2em] text-blue-400 uppercase">
          Sector view
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
          Music
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          Recorded-music household demand, forward live-event supply, grassroots
          venue viability, and current industry developments.
        </p>
      </div>

      <section className="space-y-5 rounded-2xl border border-blue-900/40 bg-blue-950/10 p-5">
        <div>
          <p className="font-data text-xs tracking-[0.16em] text-blue-400 uppercase">
            US Recorded Music Consumer Demand
          </p>
          <h2 className="mt-2 text-xl font-semibold text-zinc-100">
            BEA detailed Personal Consumption Expenditures
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-500">
            Official monthly household-spending measures. This is PCE—not
            record-label revenue, artist income, royalties, or RIAA retail
            value. Published monthly levels are seasonally adjusted annual rates
            and are not divided by twelve.
          </p>
        </div>
        {mvt.databaseStatus === "unavailable" ? (
          <p className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-200">
            BEA recorded-music demand data is temporarily unavailable.
          </p>
        ) : beaDemand?.streamingNominal && beaDemand.ownedNominal ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Audio streaming and radio services"
                value={
                  formatPublishedValue(
                    beaDemand.streamingNominal.current.value,
                    beaDemand.streamingNominal.current.unit,
                  ).headline
                }
                detail={`${monthLabel(beaDemand.streamingNominal.current.periodStart)} · MoM ${percent(beaDemand.streamingNominal.periodChange)} · YoY ${percent(beaDemand.streamingNominal.yearOverYearChange)}`}
              />
              <Metric
                label="Owned recorded media and downloads"
                value={
                  formatPublishedValue(
                    beaDemand.ownedNominal.current.value,
                    beaDemand.ownedNominal.current.unit,
                  ).headline
                }
                detail={`${monthLabel(beaDemand.ownedNominal.current.periodStart)} · MoM ${percent(beaDemand.ownedNominal.periodChange)} · YoY ${percent(beaDemand.ownedNominal.yearOverYearChange)}`}
              />
              <Metric
                label="Streaming + radio share"
                value={
                  beaDemand.share
                    ? `${beaDemand.share.streamingPct.toFixed(1)}%`
                    : "Unavailable"
                }
                detail="Share of the two compatible nominal PCE categories"
              />
              <Metric
                label="Owned-media share"
                value={
                  beaDemand.share
                    ? `${beaDemand.share.ownedPct.toFixed(1)}%`
                    : "Unavailable"
                }
                detail="Audio discs, tapes, vinyl, and permanent downloads"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Real streaming and radio services"
                value={
                  beaDemand.streamingReal
                    ? formatPublishedValue(
                        beaDemand.streamingReal.current.value,
                        beaDemand.streamingReal.current.unit,
                      ).headline
                    : "Unavailable"
                }
                detail={
                  beaDemand.streamingReal
                    ? `Official chained 2017 dollars · MoM ${percent(beaDemand.streamingReal.periodChange)} · YoY ${percent(beaDemand.streamingReal.yearOverYearChange)}`
                    : "Official detailed real series unavailable"
                }
              />
              <Metric
                label="Real owned recorded media and downloads"
                value={
                  beaDemand.ownedReal
                    ? formatPublishedValue(
                        beaDemand.ownedReal.current.value,
                        beaDemand.ownedReal.current.unit,
                      ).headline
                    : "Unavailable"
                }
                detail={
                  beaDemand.ownedReal
                    ? `Official chained 2017 dollars · MoM ${percent(beaDemand.ownedReal.periodChange)} · YoY ${percent(beaDemand.ownedReal.yearOverYearChange)}`
                    : "Official detailed real series unavailable"
                }
              />
            </div>
            <DashboardCard
              title="Recorded-music consumption history"
              description="Current-dollar PCE levels and 2019-indexed comparison"
            >
              <BeaMusicDemandChart data={beaDemand.chart} />
            </DashboardCard>
            <p className="text-xs leading-5 text-zinc-600">
              BEA&apos;s streaming category is officially “Audio streaming and
              radio services (including satellite radio),” so it is broader than
              on-demand music subscriptions alone. Source: U.S. Bureau of
              Economic Analysis · NIUnderlyingDetail tables 2.4.5U and 2.4.6U.
            </p>
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
            No detailed BEA recorded-music observations have been ingested yet.
          </p>
        )}
      </section>

      <section className="space-y-5 rounded-2xl border border-amber-900/40 bg-amber-950/10 p-5">
        <div>
          <p className="font-data text-xs tracking-[0.16em] text-amber-400 uppercase">
            US Record Production &amp; Distribution
          </p>
          <h2 className="mt-2 text-xl font-semibold text-zinc-100">
            Census Annual Integrated Economic Survey
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-500">
            Annual employer-business activity for NAICS 512250, Record
            production and distribution. This measures classified businesses—not
            household consumption, RIAA retail value, artist income, or
            royalties.
          </p>
        </div>
        {mvt.databaseStatus === "unavailable" ? (
          <p className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-200">
            Census AIES industry data is temporarily unavailable.
          </p>
        ) : censusIndustry ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Industry revenue"
                value={moneyUsd(censusIndustry.latest.revenueUsd)}
                detail={`${censusIndustry.latest.year} · Annual · ${censusIndustry.changeLabel}${censusIndustry.revenueChangePct === null ? "" : ` ${percent(censusIndustry.revenueChangePct)}`}`}
              />
              <Metric
                label="Annual payroll"
                value={moneyUsd(censusIndustry.latest.payrollUsd)}
                detail={`${censusIndustry.changeLabel}${censusIndustry.payrollChangePct === null ? "" : ` ${percent(censusIndustry.payrollChangePct)}`}`}
              />
              <Metric
                label="Employment"
                value={integer(censusIndustry.latest.employment)}
                detail={`March 12 count · ${censusIndustry.changeLabel}${censusIndustry.employmentChangePct === null ? "" : ` ${percent(censusIndustry.employmentChangePct)}`}`}
              />
              <Metric
                label="Revenue per employee"
                value={moneyUsd(censusIndustry.revenuePerEmployeeUsd)}
                detail="Tracker-calculated from valid published values"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Metric
                label="Operating expenses"
                value={moneyUsd(censusIndustry.latest.operatingExpensesUsd)}
                detail="AIES00EXP01 · employer firms"
              />
              <Metric
                label="Payroll per employee"
                value={moneyUsd(censusIndustry.payrollPerEmployeeUsd)}
                detail="Tracker-calculated from annual payroll and employment"
              />
            </div>
            <p className="text-xs leading-5 text-zinc-600">
              Official U.S. Census Bureau AIES tables AIES00BASIC and
              AIES00EXP01 · national all-establishment rows · monetary source
              values published in USD thousands and normalized to USD. Only the
              2023 AIES observation is currently comparable, so no change is
              fabricated from predecessor SAS data.
            </p>
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
            No Census AIES NAICS 512250 observation has been ingested yet. Run
            npm run ingest:census:music.
          </p>
        )}
      </section>

      <section className="space-y-5 rounded-2xl border border-orange-900/40 bg-orange-950/10 p-5">
        <div>
          <p className="font-data text-xs tracking-[0.16em] text-orange-400 uppercase">
            US Sound Recording — Long-Run Structure
          </p>
          <h2 className="mt-2 text-xl font-semibold text-zinc-100">
            BEA ACPSA · Historical
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-500">
            National-accounting output, value added, employment, and employee
            compensation for the exact ACPSA “Sound Recording” industry. This
            historical benchmark is distinct from Census business revenue and
            BEA household PCE.
          </p>
        </div>
        {mvt.databaseStatus === "unavailable" ? (
          <p className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-200">
            BEA ACPSA historical data is temporarily unavailable.
          </p>
        ) : acpsaStructure ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="ACPSA output"
                value={moneyUsd(acpsaStructure.latest.acpsaOutputUsd)}
                detail={`${acpsaStructure.latest.year} · YoY ${percent(acpsaStructure.latestGrowth.outputPct)} · nominal`}
              />
              <Metric
                label="ACPSA value added"
                value={moneyUsd(acpsaStructure.latest.acpsaValueAddedUsd)}
                detail={`YoY ${percent(acpsaStructure.latestGrowth.valueAddedPct)} · ${acpsaStructure.valueAddedSharePct?.toFixed(1) ?? "—"}% of output`}
              />
              <Metric
                label="ACPSA employment"
                value={integer(acpsaStructure.latest.acpsaEmployment)}
                detail={`YoY ${percent(acpsaStructure.latestGrowth.employmentPct)} · employees`}
              />
              <Metric
                label="Employee compensation"
                value={moneyUsd(
                  acpsaStructure.latest.acpsaEmployeeCompensationUsd,
                )}
                detail={`YoY ${percent(acpsaStructure.latestGrowth.compensationPct)} · nominal`}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric
                label="Output per worker"
                value={moneyUsd(acpsaStructure.outputPerWorkerUsd)}
                detail="Tracker-calculated national-accounting ratio"
              />
              <Metric
                label="Value added per worker"
                value={moneyUsd(acpsaStructure.valueAddedPerWorkerUsd)}
                detail="Tracker-calculated national-accounting ratio"
              />
              <Metric
                label="Compensation per worker"
                value={moneyUsd(acpsaStructure.compensationPerWorkerUsd)}
                detail="Tracker-calculated national-accounting ratio"
              />
            </div>
            <DashboardCard
              title="Sound Recording structural history"
              description="Output, value added, employment, compensation, and indexed labor comparison"
            >
              <BEAACPSAMusicChart data={acpsaStructure.chart} />
            </DashboardCard>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Output change · 1998–2023"
                value={percent(
                  acpsaStructure.since1998?.outputChangePct ?? null,
                )}
                detail={`Nominal CAGR ${percent(acpsaStructure.since1998?.outputCagrPct ?? null)}`}
              />
              <Metric
                label="Employment change · 1998–2023"
                value={percent(
                  acpsaStructure.since1998?.employmentChangePct ?? null,
                )}
                detail={`CAGR ${percent(acpsaStructure.since1998?.employmentCagrPct ?? null)}`}
              />
              <Metric
                label="Output change · 2019–2023"
                value={percent(
                  acpsaStructure.since2019?.outputChangePct ?? null,
                )}
                detail={`Nominal CAGR ${percent(acpsaStructure.since2019?.outputCagrPct ?? null)}`}
              />
              <Metric
                label="Employment change · 2019–2023"
                value={percent(
                  acpsaStructure.since2019?.employmentChangePct ?? null,
                )}
                detail={`CAGR ${percent(acpsaStructure.since2019?.employmentCagrPct ?? null)}`}
              />
            </div>
            <p className="text-xs leading-5 text-zinc-600">
              Latest official year: 2023 · Historical/structural benchmark. BEA
              states it will no longer regularly produce ACPSA statistics. No
              post-2023 values are extrapolated, and nominal output/employment
              divergence is descriptive rather than evidence of any specific
              labor cause.
            </p>
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
            No BEA ACPSA Sound Recording history has been ingested yet. Run npm
            run ingest:bea:acpsa:music.
          </p>
        )}
      </section>

      <section className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-data text-xs tracking-[0.16em] text-emerald-400 uppercase">
              Live Music Supply
            </p>
            <h2 className="mt-2 text-xl font-semibold text-zinc-100">
              Ticketmaster Music
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
              Forward Ticketmaster-covered event supply, distinct from venue
              profitability and recorded-music revenue.
            </p>
          </div>
          <form className="flex items-end gap-2">
            <label className="space-y-1 text-xs text-zinc-500">
              <span>Country</span>
              <select
                name="country"
                defaultValue={country}
                className="block rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300"
              >
                {COUNTRIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200"
              type="submit"
            >
              Apply
            </button>
          </form>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Next 30D events"
            value={integer(supply30.summary.events)}
            detail={`Supply change ${percent(trend30.comparison?.eventCountPctChange ?? null)}`}
          />
          <Metric
            label="Next 90D events"
            value={integer(supply90.summary.events)}
            detail={`Supply change ${percent(trend90.comparison?.eventCountPctChange ?? null)}`}
          />
          <Metric
            label="Active venues · 90D"
            value={integer(supply90.summary.venues)}
            detail={`Change ${percent(trend90.comparison?.activeVenuePctChange ?? null)}`}
          />
          <Metric
            label="Events per venue · 90D"
            value={supply90.summary.eventsPerVenue?.toFixed(1) ?? "Unavailable"}
            detail={`Change ${percent(trend90.comparison?.eventsPerVenuePctChange ?? null)}`}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="On sale · 90D"
            value={integer(supply90.summary.statuses.onsale ?? 0)}
          />
          <Metric
            label="Off sale · 90D"
            value={integer(supply90.summary.statuses.offsale ?? 0)}
            detail="Offsale is not cancellation"
          />
          <Metric
            label="Canceled / cancelled · 90D"
            value={integer(
              (supply90.summary.statuses.canceled ?? 0) +
                (supply90.summary.statuses.cancelled ?? 0),
            )}
          />
          <Metric
            label="Postponed / rescheduled · 90D"
            value={integer(
              (supply90.summary.statuses.postponed ?? 0) +
                (supply90.summary.statuses.rescheduled ?? 0),
            )}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric
            label="Cancellation transitions"
            value={integer(
              transitions
                ? (transitionsByDestination(transitions, "cancelled") ?? 0) +
                    (transitionsByDestination(transitions, "canceled") ?? 0)
                : null,
            )}
            detail="Observed between comparable snapshots"
          />
          <Metric
            label="Offsale transitions"
            value={integer(transitionsByDestination(transitions, "offsale"))}
          />
          <Metric
            label="Reschedule transitions"
            value={integer(
              transitionsByDestination(transitions, "rescheduled"),
            )}
          />
        </div>
        {trends30.hasComparableHistory || trends90.hasComparableHistory ? (
          <DashboardCard
            title="Forward supply snapshots"
            description="Persisted 30D and 90D Music history"
          >
            <TicketmasterMusicTrendChart
              data={[...trendPoints.values()].sort((left, right) =>
                left.capturedAt.localeCompare(right.capturedAt),
              )}
            />
          </DashboardCard>
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
            Collecting longitudinal history. Changes appear only after
            comparable country, segment, and window snapshots accumulate.
          </p>
        )}
      </section>

      <section className="space-y-5 rounded-2xl border border-violet-900/40 bg-violet-950/10 p-5">
        <div>
          <p className="font-data text-xs tracking-[0.16em] text-violet-400 uppercase">
            UK Grassroots Venue Viability
          </p>
          <h2 className="mt-2 text-xl font-semibold text-zinc-100">
            Music Venue Trust
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-500">
            Official annual MVT reports covering Music Venues Alliance
            grassroots venues. This is not all UK live music or arena and
            stadium touring.
          </p>
        </div>
        {mvt.databaseStatus === "unavailable" ? (
          <p className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-200">
            MVT structural data is temporarily unavailable.
          </p>
        ) : mvtAnalytics ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Trading grassroots venues"
                value={integer(mvtAnalytics.latest.venueCount)}
                detail={`${mvtAnalytics.latest.year} · YoY ${percent(mvtAnalytics.venueCountYoyPct)}`}
              />
              <Metric
                label="Permanent closures"
                value={integer(mvtAnalytics.latest.permanentClosures)}
                detail="Source membership review"
              />
              <Metric
                label="Venues reporting no profit"
                value={
                  mvtAnalytics.latest.venuesUnprofitablePct === null
                    ? "Unavailable"
                    : `${mvtAnalytics.latest.venuesUnprofitablePct.toFixed(1)}%`
                }
                detail="2025 wording differs from prior loss-based reports"
              />
              <Metric
                label="Average profit margin"
                value={
                  mvtAnalytics.latest.averageProfitMarginPct === null
                    ? "Unavailable"
                    : `${mvtAnalytics.latest.averageProfitMarginPct.toFixed(2)}%`
                }
              />
              <Metric
                label="Events"
                value={integer(mvtAnalytics.latest.eventCount)}
                detail={`YoY ${percent(mvtAnalytics.eventCountYoyPct)}`}
              />
              <Metric
                label="Audience visits"
                value={integer(mvtAnalytics.latest.audienceVisits)}
                detail={`YoY ${percent(mvtAnalytics.audienceYoyPct)}`}
              />
              <Metric
                label="Sector revenue"
                value={moneyGbp(mvtAnalytics.latest.totalSectorRevenueGbp)}
                detail={`YoY ${percent(mvtAnalytics.revenueYoyPct)} · nominal GBP`}
              />
              <Metric
                label="Employment"
                value={integer(mvtAnalytics.latest.employment)}
                detail={`${integer(mvtAnalytics.latest.jobsLost)} fewer than 2024`}
              />
            </div>
            <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
              <DashboardCard
                title="Grassroots venue history"
                description="Annual official-report observations"
              >
                <MVTViabilityChart data={mvtAnalytics.chart} />
              </DashboardCard>
              <DashboardCard
                title="Latest structural context"
                description={`MVT Annual Report ${mvtAnalytics.latest.year}`}
              >
                <dl className="space-y-4 text-sm">
                  <div>
                    <dt className="text-zinc-500">
                      Ticketed live-music events
                    </dt>
                    <dd className="mt-1 text-zinc-200">
                      {integer(mvtAnalytics.latest.ticketedLiveMusicEvents)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Live-music income</dt>
                    <dd className="mt-1 text-zinc-200">
                      {moneyGbp(mvtAnalytics.latest.liveMusicIncomeGbp)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">
                      Towns without regular touring
                    </dt>
                    <dd className="mt-1 text-zinc-200">
                      {integer(mvtAnalytics.latest.townsWithoutRegularTouring)}
                    </dd>
                  </div>
                </dl>
                <p className="mt-5 border-t border-zinc-800 pt-4 text-xs leading-5 text-zinc-600">
                  Annual survey definitions and membership coverage vary.
                  Tracker YoY comparisons are withheld when definitions are not
                  comparable.
                </p>
              </DashboardCard>
            </div>
          </>
        ) : (
          <DashboardCard
            title="UK Grassroots Venue Viability"
            description="Official MVT annual reports"
          >
            <EmptyChart
              label="MVT annual observations"
              message="Run npm run ingest:mvt"
            />
          </DashboardCard>
        )}
      </section>

      <DashboardCard
        title="Recent Developments"
        description="Latest Music media article candidates"
      >
        <MediaArticleList
          articles={developments}
          emptyMessage="No recent music developments are available"
        />
      </DashboardCard>
    </div>
  );
}
