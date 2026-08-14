import type { Metadata } from "next";

import { DashboardCard, EmptyChart } from "@/components/dashboard-card";
import { BFIBoxOfficeChart } from "@/components/bfi-box-office-chart";
import { MediaArticleList } from "@/components/media-article-list";
import { USBoxOfficeChart } from "@/components/us-box-office-chart";
import { US_BOX_OFFICE_PROVENANCE } from "@/data-sources/film/us-box-office-types";
import { getUSBoxOfficeData } from "@/services/film/us-box-office";
import { getBFIFilmData } from "@/services/film/bfi";
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

function gbp(value: number | null): string {
  if (value === null) return "Unavailable";
  if (value >= 1_000_000_000) return `£${(value / 1_000_000_000).toFixed(2)}B`;
  return `£${(value / 1_000_000).toFixed(1)}M`;
}

function gbpMillions(value: number | null): string {
  return value === null
    ? "Unavailable"
    : `£${value.toLocaleString("en-GB", { maximumFractionDigits: 1 })}M`;
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
  const [boxOffice, bfi, developments] = await Promise.all([
    getUSBoxOfficeData(),
    getBFIFilmData(),
    getRecentMediaDevelopments("film"),
  ]);
  const analytics = boxOffice.analytics;
  const uk = bfi.analytics;
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
          Cinema demand in the US and UK, official UK structural statistics, and
          current film-industry developments.
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

      <section className="rounded-2xl border border-violet-900/50 bg-violet-950/15 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-data text-xs tracking-[0.16em] text-violet-400 uppercase">
              UK Weekend Box Office
            </p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-100">
              British Film Institute
            </h2>
          </div>
          <span className="rounded-full border border-violet-800 px-2.5 py-1 text-xs text-violet-300">
            Official public reports
          </span>
        </div>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-zinc-400">
          Nominal GBP · Friday–Sunday. The headline uses all film rows reported
          in each BFI workbook: the top 15 plus other UK and new releases. It is
          therefore labelled reported gross rather than a complete-market total.
        </p>
      </section>

      {bfi.databaseStatus === "unavailable" ? (
        <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-200">
          BFI film data is temporarily unavailable.
        </div>
      ) : uk ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Latest reported gross"
              value={gbp(uk.latest.reportedGrossGbp)}
              detail={uk.latest.weekendEnd.toISOString().slice(0, 10)}
            />
            <Metric
              label="Week over week"
              value={change(uk.wowPct)}
              detail="Consecutive published weekends"
            />
            <Metric
              label="Year over year"
              value={change(uk.yoyPct)}
              detail="Equivalent ISO weekend"
            />
            <Metric
              label="Four-week reported gross"
              value={gbp(uk.rolling4WeekGrossGbp)}
            />
            <Metric
              label="Calendar YTD reported gross"
              value={gbp(uk.ytdGrossGbp)}
              detail="Equivalent elapsed ISO weeks"
            />
            <Metric
              label="YTD vs prior year"
              value={change(uk.ytdVsPreviousYearPct)}
            />
            <Metric
              label="YTD vs 2019"
              value={change(uk.ytdVs2019Pct)}
              detail="Equivalent elapsed weekends · nominal GBP"
            />
            <Metric
              label="Trailing 52-week reported gross"
              value={gbp(uk.trailing52WeekGrossGbp)}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
            <DashboardCard
              title="UK reported weekend box office"
              description="Weekly and four-week rolling nominal GBP"
            >
              <BFIBoxOfficeChart data={uk.chart} />
            </DashboardCard>
            <DashboardCard
              title="Latest BFI report"
              description="Source-published and tracker-calculated context"
            >
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-zinc-500">#1 film</dt>
                  <dd className="mt-1 text-zinc-200">
                    {uk.latest.topFilm ?? "Unavailable"}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Reported releases</dt>
                  <dd className="mt-1 text-zinc-200">
                    {uk.latest.releaseCount.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">
                    Source-published top-15 gross
                  </dt>
                  <dd className="mt-1 text-zinc-200">
                    {gbp(uk.latest.top15GrossGbp)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">#1 / Top 3 / Top 5 share</dt>
                  <dd className="mt-1 text-zinc-200">
                    {[uk.topFilmSharePct, uk.top3SharePct, uk.top5SharePct]
                      .map((value) =>
                        value === null ? "—" : `${value.toFixed(1)}%`,
                      )
                      .join(" · ")}
                  </dd>
                </div>
              </dl>
              <p className="mt-5 border-t border-zinc-800 pt-4 text-xs leading-5 text-zinc-600">
                Concentration shares use reported-gross coverage, not a complete
                UK market denominator. Retrieved{" "}
                {bfi.retrievedAt?.toISOString().slice(0, 10) ?? "unknown"}.
              </p>
            </DashboardCard>
          </div>

          {uk.structural ? (
            <DashboardCard
              title="UK Film Market Structure"
              description={`BFI Statistical Yearbook · annual official statistics · ${uk.structural.latest.year}`}
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                  label="Cinema admissions"
                  value={`${uk.structural.latest.cinemaAdmissionsMillions?.toFixed(1) ?? "—"}M`}
                  detail={`YoY ${change(uk.structural.admissionsYoyPct)} · vs 2019 ${change(uk.structural.admissionsVs2019Pct)}`}
                />
                <Metric
                  label="Annual UK box office"
                  value={gbpMillions(uk.structural.latest.ukBoxOfficeGrossGbpM)}
                  detail="Nominal GBP · annual"
                />
                <Metric
                  label="Feature-film production spend"
                  value={gbpMillions(
                    uk.structural.latest.filmProductionSpendGbpM,
                  )}
                  detail={`YoY ${change(uk.structural.productionSpendYoyPct)}`}
                />
                <Metric
                  label="Feature-film productions"
                  value={
                    uk.structural.latest.filmProductionCount?.toLocaleString() ??
                    "Unavailable"
                  }
                  detail="Allocated by principal photography start"
                />
              </div>
              <p className="mt-4 text-xs leading-5 text-zinc-600">
                Admissions and box office describe theatrical demand;
                feature-film production describes production activity. HETV is
                stored separately and is not presented as film production.
              </p>
            </DashboardCard>
          ) : null}
        </>
      ) : (
        <DashboardCard
          title="UK weekend box office"
          description="Official BFI public spreadsheets"
        >
          <EmptyChart
            label="BFI weekend box office"
            message="Run npm run ingest:bfi -- --since=2019"
          />
        </DashboardCard>
      )}

      {analytics && uk ? (
        <DashboardCard
          title="US / UK theatrical comparison"
          description="Currency-safe equivalent-period context"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric
              label="US YTD vs 2019"
              value={change(analytics.ytdVs2019Pct)}
              detail="Provisional US dataset · nominal USD"
            />
            <Metric
              label="UK reported YTD vs 2019"
              value={change(uk.ytdVs2019Pct)}
              detail="BFI reported coverage · nominal GBP"
            />
          </div>
          <p className="mt-4 text-xs leading-5 text-zinc-600">
            Raw USD and GBP levels are not compared. Each percentage uses its
            own market&apos;s equivalent elapsed 2019 weekends.
          </p>
        </DashboardCard>
      ) : null}

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
