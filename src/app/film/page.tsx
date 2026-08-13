import type { Metadata } from "next";

import { DashboardCard, EmptyChart } from "@/components/dashboard-card";
import { MediaArticleList } from "@/components/media-article-list";
import { USBoxOfficeChart } from "@/components/us-box-office-chart";
import { US_BOX_OFFICE_PROVENANCE } from "@/data-sources/film/us-box-office-types";
import { getUSBoxOfficeData } from "@/services/film/us-box-office";
import { getRecentMediaDevelopments } from "@/services/media/media";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Film" };

function money(value: number | null): string {
  if (value === null) return "Unavailable";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  return `$${(value / 1_000_000).toFixed(1)}M`;
}

function change(value: number | null): string {
  if (value === null) return "Unavailable";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
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

export default async function FilmPage() {
  const [boxOffice, developments] = await Promise.all([
    getUSBoxOfficeData(),
    getRecentMediaDevelopments("film"),
  ]);
  const analytics = boxOffice.analytics;
  return (
    <div className="space-y-6">
      <div>
        <p className="font-data text-xs tracking-[0.2em] text-blue-400 uppercase">
          Sector view
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
          Film
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          Cinema demand, US domestic box office, and current film-industry
          developments.
        </p>
      </div>

      <section className="rounded-2xl border border-amber-900/50 bg-amber-950/15 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-data text-xs tracking-[0.16em] text-amber-400 uppercase">
              US Domestic Box Office
            </p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-100">
              Provisional community dataset
            </h2>
          </div>
          <span className="rounded-full border border-amber-800 px-2.5 py-1 text-xs text-amber-300">
            Research placeholder
          </span>
        </div>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-zinc-400">
          Provider: Kaggle community dataset · Dataset: U.S. Weekend Box Office
          Summaries · Underlying provenance: {US_BOX_OFFICE_PROVENANCE}. Replace
          with a licensed or primary US theatrical source before public
          production deployment.
        </p>
      </section>

      {boxOffice.databaseStatus === "unavailable" ? (
        <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-200">
          US box-office data is temporarily unavailable.
        </div>
      ) : analytics ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Latest weekend gross"
              value={money(analytics.latest.totalGrossUsd)}
              detail={analytics.latest.weekendEnd.toISOString().slice(0, 10)}
            />
            <Metric
              label="Week over week"
              value={change(analytics.wowPct)}
              detail="Tracker calculated from consecutive weekends"
            />
            <Metric
              label="Year over year"
              value={change(analytics.yoyPct)}
              detail={`Equivalent source week ${analytics.latest.weekNumber}`}
            />
            <Metric
              label="Four-week rolling gross"
              value={money(analytics.rolling4WeekGrossUsd)}
            />
            <Metric
              label="Calendar YTD gross"
              value={money(analytics.ytdGrossUsd)}
              detail={`Through source week ${analytics.latest.weekNumber}`}
            />
            <Metric
              label="YTD vs prior year"
              value={change(analytics.ytdVsPreviousYearPct)}
              detail="Equivalent elapsed weekends"
            />
            <Metric
              label="YTD vs 2019"
              value={change(analytics.ytdVs2019Pct)}
              detail="Equivalent elapsed weekends · nominal USD"
            />
            <Metric
              label="Trailing 52-week gross"
              value={money(analytics.trailing52WeekGrossUsd)}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
            <DashboardCard
              title="US weekend box office"
              description="Weekly and four-week rolling nominal domestic gross"
            >
              <USBoxOfficeChart data={analytics.chart} />
            </DashboardCard>
            <DashboardCard
              title="Latest weekend"
              description="Source-published market detail"
            >
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-zinc-500">#1 film</dt>
                  <dd className="mt-1 text-zinc-200">
                    {analytics.latest.topFilm ?? "Unavailable"}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Releases</dt>
                  <dd className="mt-1 text-zinc-200">
                    {analytics.latest.releaseCount?.toLocaleString() ??
                      "Unavailable"}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Top 10 gross</dt>
                  <dd className="mt-1 text-zinc-200">
                    {money(analytics.latest.top10GrossUsd)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Dataset-published WoW</dt>
                  <dd className="mt-1 text-zinc-200">
                    {analytics.latest.sourceWowChangeLabel ??
                      change(analytics.latest.sourceWowChangePct)}
                  </dd>
                </div>
              </dl>
              <p className="mt-5 border-t border-zinc-800 pt-4 text-xs leading-5 text-zinc-600">
                Retrieved{" "}
                {boxOffice.retrievedAt?.toISOString().slice(0, 10) ?? "unknown"}
                . Kaggle dataset update{" "}
                {boxOffice.datasetUpdatedAt?.toISOString().slice(0, 10) ??
                  "unknown"}
                .
              </p>
            </DashboardCard>
          </div>
        </>
      ) : (
        <DashboardCard
          title="US weekend box office"
          description="Provisional community dataset"
        >
          <EmptyChart
            label="US weekend box office"
            message="Run npm run ingest:usboxoffice"
          />
        </DashboardCard>
      )}

      <DashboardCard
        title="Recent Developments"
        description="Latest Film media article candidates"
      >
        <MediaArticleList
          articles={developments}
          emptyMessage="No recent film developments are available"
        />
      </DashboardCard>
    </div>
  );
}
