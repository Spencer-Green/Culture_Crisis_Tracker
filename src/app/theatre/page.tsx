import type { Metadata } from "next";

import { BroadwayMarketChart } from "@/components/broadway-market-chart";
import { DashboardCard, EmptyChart } from "@/components/dashboard-card";
import { MediaArticleList } from "@/components/media-article-list";
import {
  TicketmasterTheatreTrendChart,
  type TicketmasterTheatreTrendPoint,
} from "@/components/ticketmaster-theatre-trend-chart";
import { getTicketmasterSupplyTrends } from "@/services/industry-events/ticketmaster-longitudinal";
import { getTicketmasterSupply } from "@/services/industry-events/ticketmaster-supply";
import { getRecentMediaDevelopments } from "@/services/media/media";
import { getBroadwayMarketData } from "@/services/theatre/theatre";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Theatre" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const COUNTRIES = ["US", "GB", "AU", "CA"] as const;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function money(value: number | null): string {
  if (value === null) return "Unavailable";
  return value >= 1_000_000
    ? `$${(value / 1_000_000).toFixed(2)}M`
    : `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function integer(value: number | null): string {
  return value === null ? "Unavailable" : Math.round(value).toLocaleString();
}

function percent(value: number | null, suffix = "%"): string {
  if (value === null) return "Insufficient history";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;
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
): number | null {
  if (!values) return null;
  return Object.entries(values)
    .filter(([key]) => key.endsWith(`→ ${destination}`))
    .reduce((sum, [, count]) => sum + count, 0);
}

export default async function TheatrePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const candidate = first(params.country);
  const country = COUNTRIES.includes(candidate as (typeof COUNTRIES)[number])
    ? (candidate as (typeof COUNTRIES)[number])
    : "US";
  const [broadway, supply30, supply90, trends30, trends90, developments] =
    await Promise.all([
      getBroadwayMarketData(),
      getTicketmasterSupply({
        days: 30,
        countryCode: country,
        segmentName: "Arts & Theatre",
      }),
      getTicketmasterSupply({
        days: 90,
        countryCode: country,
        segmentName: "Arts & Theatre",
      }),
      getTicketmasterSupplyTrends({
        windowDays: 30,
        countryCode: country,
        segmentName: "Arts & Theatre",
      }),
      getTicketmasterSupplyTrends({
        windowDays: 90,
        countryCode: country,
        segmentName: "Arts & Theatre",
      }),
      getRecentMediaDevelopments("theatre"),
    ]);
  const analytics = broadway.analytics;
  const trend30 = trends30.entries[0];
  const trend90 = trends90.entries[0];
  const transitions = trend90.transitionCounts ?? trend30.transitionCounts;
  const trendPoints = new Map<string, TicketmasterTheatreTrendPoint>();
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

  return (
    <div className="space-y-6">
      <div>
        <p className="font-data text-xs tracking-[0.2em] text-blue-400 uppercase">
          Sector view
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
          Theatre
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          Realized Broadway demand, broader live-event supply, and current
          theatre-industry developments.
        </p>
      </div>

      <section className="rounded-2xl border border-violet-900/50 bg-violet-950/10 p-5">
        <p className="font-data text-xs tracking-[0.16em] text-violet-400 uppercase">
          Broadway Weekly Market · New York City
        </p>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-400">
          Public structured Broadway Business data, with underlying statistics
          attributed to The Broadway League. Broadway NYC is a bellwether, not a
          census of US theatre. Provisional private-research use; reassess
          licensing before public deployment.
        </p>
      </section>

      {broadway.databaseStatus === "unavailable" ? (
        <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-200">
          Broadway market data is temporarily unavailable.
        </div>
      ) : analytics ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Weekly gross"
              value={money(analytics.latest.grossUsd)}
              detail={`${analytics.latest.weekEnding.toISOString().slice(0, 10)} · nominal USD`}
            />
            <Metric
              label="Gross YoY"
              value={percent(analytics.grossYoyPct)}
              detail={`WoW ${percent(analytics.grossWowPct)}`}
            />
            <Metric
              label="Attendance"
              value={integer(analytics.latest.attendance)}
              detail={`YoY ${percent(analytics.attendanceYoyPct)} · WoW ${percent(analytics.attendanceWowPct)}`}
            />
            <Metric
              label="Shows"
              value={integer(analytics.latest.showCount)}
              detail={
                analytics.latest.showCount === null
                  ? "Historical chart does not expose show count"
                  : "Source-published current week"
              }
            />
            <Metric
              label="Capacity"
              value={
                analytics.latest.capacityPct === null
                  ? "Unavailable"
                  : `${analytics.latest.capacityPct.toFixed(1)}%`
              }
              detail={`YoY ${percent(analytics.capacityYoyPp, " pp")}`}
            />
            <Metric
              label="Average ticket"
              value={money(analytics.averageTicketPriceUsd)}
              detail={`YoY ${percent(analytics.averageTicketYoyPct)} · source/derived where needed`}
            />
            <Metric
              label="4-week gross"
              value={money(analytics.rolling4GrossUsd)}
              detail={`vs comparable 2019 ${percent(analytics.rolling4Vs2019GrossPct)}`}
            />
            <Metric
              label="4-week attendance"
              value={integer(analytics.rolling4Attendance)}
              detail={`vs comparable 2019 ${percent(analytics.rolling4Vs2019AttendancePct)}`}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
            <DashboardCard
              title="Broadway market history"
              description="Gross, attendance, shows, capacity, and average ticket"
            >
              <BroadwayMarketChart data={analytics.chart} />
            </DashboardCard>
            <DashboardCard
              title="Demand context"
              description="Revenue and participation should be read together"
            >
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-zinc-500">13-week gross</dt>
                  <dd className="mt-1 text-zinc-200">
                    {money(analytics.rolling13GrossUsd)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">13-week attendance</dt>
                  <dd className="mt-1 text-zinc-200">
                    {integer(analytics.rolling13Attendance)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Calendar YTD gross</dt>
                  <dd className="mt-1 text-zinc-200">
                    {money(analytics.ytdGrossUsd)} · vs prior year{" "}
                    {percent(analytics.ytdGrossVsPreviousPct)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Calendar YTD attendance</dt>
                  <dd className="mt-1 text-zinc-200">
                    {integer(analytics.ytdAttendance)} · vs prior year{" "}
                    {percent(analytics.ytdAttendanceVsPreviousPct)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Gross per show</dt>
                  <dd className="mt-1 text-zinc-200">
                    {money(analytics.grossPerShow)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Attendance per show</dt>
                  <dd className="mt-1 text-zinc-200">
                    {integer(analytics.attendancePerShow)}
                  </dd>
                </div>
              </dl>
              <p className="mt-5 border-t border-zinc-800 pt-4 text-xs leading-5 text-zinc-600">
                Nominal gross may rise because ticket prices rise even when
                attendance does not. No inflation adjustment or health score is
                applied.
              </p>
            </DashboardCard>
          </div>
        </>
      ) : (
        <DashboardCard
          title="Broadway Weekly Market"
          description="Public structured market statistics"
        >
          <EmptyChart
            label="Broadway market history"
            message="Run npm run ingest:broadwaybusiness"
          />
        </DashboardCard>
      )}

      <section className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-data text-xs tracking-[0.16em] text-emerald-400 uppercase">
              Live Theatre Supply
            </p>
            <h2 className="mt-2 text-xl font-semibold text-zinc-100">
              Ticketmaster Arts &amp; Theatre
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
              Broader forward listings and venues; not interchangeable with
              realized Broadway NYC demand.
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
            label="Cancellation transitions"
            value={integer(
              (transitionsByDestination(transitions, "cancelled") ?? 0) +
                (transitionsByDestination(transitions, "canceled") ?? 0),
            )}
            detail={
              transitions
                ? "Observed between comparable snapshots"
                : "Collecting longitudinal history"
            }
          />
          <Metric
            label="Offsale transitions"
            value={integer(transitionsByDestination(transitions, "offsale"))}
            detail="Offsale is not cancellation"
          />
          <Metric
            label="Postponement transitions"
            value={integer(transitionsByDestination(transitions, "postponed"))}
          />
          <Metric
            label="Reschedule transitions"
            value={integer(
              transitionsByDestination(transitions, "rescheduled"),
            )}
          />
        </div>
        {!trends30.hasComparableHistory && !trends90.hasComparableHistory ? (
          <p className="rounded-xl border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
            Collecting longitudinal history. Supply changes will appear after
            comparable country, segment, and window snapshots accumulate.
          </p>
        ) : null}
        {trends30.hasComparableHistory || trends90.hasComparableHistory ? (
          <DashboardCard
            title="Forward supply snapshots"
            description="Persisted 30D and 90D Arts & Theatre history"
          >
            <TicketmasterTheatreTrendChart
              data={[...trendPoints.values()].sort((left, right) =>
                left.capturedAt.localeCompare(right.capturedAt),
              )}
            />
          </DashboardCard>
        ) : null}
        <p className="text-xs leading-5 text-zinc-600">
          Ticketmaster is not a complete theatre census. Disappearing listings
          and events aging out of a window are not counted as cancellations.
        </p>
      </section>

      <DashboardCard
        title="Recent Developments"
        description="Latest Theatre media article candidates"
      >
        <MediaArticleList
          articles={developments}
          emptyMessage="No recent theatre developments are available"
        />
      </DashboardCard>
    </div>
  );
}
