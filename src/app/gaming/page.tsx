import type { Metadata } from "next";

import { DashboardCard, EmptyChart } from "@/components/dashboard-card";
import { GamingReleaseChart } from "@/components/gaming-release-chart";
import { getGamingData } from "@/services/gaming/analytics";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gaming" };

function formatPercent(value: number | null, digits = 1): string {
  return value === null ? "N/A" : `${value.toFixed(digits)}%`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="font-data mt-2 text-xl text-zinc-100">{value}</p>
    </div>
  );
}

function RankedList({ items }: { items: { label: string; count: number }[] }) {
  return (
    <ol className="space-y-2">
      {items.map((item, index) => (
        <li
          key={item.label}
          className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800/80 px-3 py-2 text-xs"
        >
          <span className="truncate text-zinc-400">
            {index + 1}. {item.label}
          </span>
          <span className="font-data text-zinc-200">
            {item.count.toLocaleString()}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default async function GamingPage() {
  const data = await getGamingData();
  const analytics = data.analytics;
  return (
    <div className="space-y-6">
      <div>
        <p className="font-data text-xs tracking-[0.2em] text-blue-400 uppercase">
          Gaming
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
          Gaming market activity
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          IGDB release supply with Steam-covered player, review, and pricing
          snapshots. These are descriptive market signals, not a Gaming Stress
          score.
        </p>
      </div>

      {!analytics ? (
        <div className="rounded-2xl border border-amber-900/50 bg-amber-950/20 p-5 text-sm text-amber-200/80">
          Gaming analytics are temporarily unavailable.
        </div>
      ) : analytics.totalGames === 0 ? (
        <EmptyChart
          label="Gaming data"
          message="No IGDB games have been ingested."
        />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Stat
              label="Tracked IGDB games"
              value={analytics.totalGames.toLocaleString()}
            />
            <Stat
              label="Latest 12 months"
              value={analytics.latestTwelveMonthReleases.toLocaleString()}
            />
            <Stat
              label="Steam-mapped titles"
              value={analytics.steam.mappedGames.toLocaleString()}
            />
            <Stat
              label="Unique developers"
              value={analytics.developers.uniqueCompanies.toLocaleString()}
            />
            <Stat
              label="Unique publishers"
              value={analytics.publishers.uniqueCompanies.toLocaleString()}
            />
          </section>

          <div className="grid gap-6 xl:grid-cols-3">
            <DashboardCard
              title="Game Releases Over Time"
              description="IGDB first-release records; source completeness varies"
              className="xl:col-span-2"
            >
              <GamingReleaseChart
                monthly={analytics.releaseSeries.monthly}
                quarterly={analytics.releaseSeries.quarterly}
              />
            </DashboardCard>
            <DashboardCard
              title="Upcoming Supply"
              description="IGDB release dates; farther horizons are less complete"
            >
              <div className="grid gap-3">
                <Stat label="Next 30 days" value={analytics.upcoming.days30} />
                <Stat label="Next 90 days" value={analytics.upcoming.days90} />
                <Stat
                  label="Next 180 days"
                  value={analytics.upcoming.days180}
                />
              </div>
            </DashboardCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <DashboardCard
              title="Genre Mix"
              description="Multi-genre assignments; counts are not mutually exclusive"
            >
              <RankedList items={analytics.topGenres} />
            </DashboardCard>
            <DashboardCard
              title="Platform Mix"
              description="IGDB platform coverage; multi-platform games appear in each platform"
            >
              <RankedList items={analytics.topPlatforms} />
            </DashboardCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <DashboardCard
              title="Steam Activity"
              description="Point-in-time concurrent players across Steam-covered titles"
            >
              <div className="grid grid-cols-2 gap-3">
                <Stat
                  label="Snapshot titles"
                  value={analytics.steam.snapshotGames}
                />
                <Stat
                  label="Player coverage"
                  value={formatPercent(analytics.steam.playerCoveragePercent)}
                />
                <Stat
                  label="Current players · sum"
                  value={analytics.steam.totalCurrentPlayers.toLocaleString()}
                />
                <Stat
                  label="Median current players"
                  value={
                    analytics.steam.medianCurrentPlayers?.toLocaleString() ??
                    "N/A"
                  }
                />
              </div>
              <p className="mt-4 text-xs leading-5 text-zinc-600">
                Concurrent players are users currently connected to Steam, not
                DAU, MAU, sales, or total gaming engagement.
              </p>
              <ul className="mt-4 space-y-2">
                {analytics.steam.topCurrentPlayers.slice(0, 5).map((item) => (
                  <li
                    key={item.name}
                    className="flex justify-between gap-4 text-xs"
                  >
                    <span className="truncate text-zinc-400">{item.name}</span>
                    <span className="font-data text-zinc-200">
                      {item.value.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </DashboardCard>
            <DashboardCard
              title="Reviews & Pricing"
              description="Steam store/review coverage; reviews are not unit sales"
            >
              <div className="grid grid-cols-2 gap-3">
                <Stat
                  label="Review coverage"
                  value={formatPercent(analytics.steam.reviewCoveragePercent)}
                />
                <Stat
                  label="Median reviews"
                  value={
                    analytics.steam.medianReviews?.toLocaleString() ?? "N/A"
                  }
                />
                <Stat
                  label="Price coverage"
                  value={formatPercent(analytics.steam.priceCoveragePercent)}
                />
                <Stat
                  label="Currently discounted"
                  value={formatPercent(analytics.steam.discountSharePercent)}
                />
                <Stat
                  label="Median discount"
                  value={formatPercent(analytics.steam.medianDiscountPercent)}
                />
                <Stat
                  label="Free to play"
                  value={formatPercent(analytics.steam.freeToPlaySharePercent)}
                />
              </div>
              <p className="mt-4 text-xs leading-5 text-zinc-600">
                Prices remain in source currencies. Discounting and review
                volume are descriptive signals, not distress or sales measures.
              </p>
            </DashboardCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <DashboardCard
              title="Publisher Structure"
              description="Share of attributed tracked releases, not revenue concentration"
            >
              <p className="font-data text-2xl text-zinc-100">
                {formatPercent(analytics.publishers.topTenShare)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Top 10 publishers&apos; share of publisher-attributed releases
              </p>
              <div className="mt-4">
                <RankedList
                  items={analytics.publishers.topCompanies.slice(0, 5)}
                />
              </div>
            </DashboardCard>
            <DashboardCard
              title="Developer Structure"
              description="Share of attributed tracked releases, not workforce or revenue concentration"
            >
              <p className="font-data text-2xl text-zinc-100">
                {formatPercent(analytics.developers.topTenShare)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Top 10 developers&apos; share of developer-attributed releases
              </p>
              <div className="mt-4">
                <RankedList
                  items={analytics.developers.topCompanies.slice(0, 5)}
                />
              </div>
            </DashboardCard>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 text-xs leading-5 text-zinc-500">
            IGDB coverage and metadata completeness vary. Steam is not the
            entire PC or gaming market. Longitudinal Steam trends begin only
            when snapshots are collected; no historical activity is
            reconstructed.
          </div>
        </>
      )}
    </div>
  );
}
