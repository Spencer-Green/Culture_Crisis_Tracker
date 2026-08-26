"use client";

import { useMemo, useState } from "react";

import type { ScreenAustraliaPeriodType } from "@/data-sources/film/screen-australia-types";

type View = {
  periodType: ScreenAustraliaPeriodType;
  reportDate: string;
  ageDays: number;
  stale: boolean;
  retrievedAt: string | null;
  rows: {
    rank: number;
    title: string;
    periodGrossAud: number | null;
    cumulativeGrossAud: number | null;
    releaseWeeks: string | null;
  }[];
};

const LABELS: Record<ScreenAustraliaPeriodType, string> = {
  WEEKLY_TOP_5: "Weekly Top 5",
  AUSTRALIAN_YTD: "Australian Films YTD",
  MONTHLY_TOP_20: "Monthly Top 20",
  OVERALL_YTD_TOP_50: "Overall YTD Top 50",
};

const GROSS_LABELS: Record<ScreenAustraliaPeriodType, string> = {
  WEEKLY_TOP_5: "Weekly gross",
  AUSTRALIAN_YTD: "Year gross",
  MONTHLY_TOP_20: "Four-week gross",
  OVERALL_YTD_TOP_50: "Year gross",
};

function aud(value: number | null) {
  if (value === null) return "Unavailable";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

function date(value: string | null) {
  if (!value) return "Unavailable";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function ScreenAustraliaBoxOffice({
  views,
  databaseStatus,
  lastSuccessfulAt,
  nextScheduledAt,
  lastRunFailed,
}: {
  views: View[];
  databaseStatus: "available" | "unavailable";
  lastSuccessfulAt: string | null;
  nextScheduledAt: string | null;
  lastRunFailed: boolean;
}) {
  const [selectedType, setSelectedType] = useState<ScreenAustraliaPeriodType>(
    views[0]?.periodType ?? "WEEKLY_TOP_5",
  );
  const view = useMemo(
    () =>
      views.find((candidate) => candidate.periodType === selectedType) ??
      views[0],
    [selectedType, views],
  );

  return (
    <section className="rounded-2xl border border-cyan-900/50 bg-cyan-950/15 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-data text-xs tracking-[0.16em] text-cyan-400 uppercase">
            Australian Box Office — Current
          </p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-100">
            Screen Australia
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Current title rankings published in the official public box-office
            widget.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-cyan-800 px-2.5 py-1 text-xs text-cyan-300">
            Weekly · AUD
          </span>
          <span className="rounded-full border border-amber-800 px-2.5 py-1 text-xs text-amber-300">
            Provisional private/research
          </span>
        </div>
      </div>

      {databaseStatus === "unavailable" ? (
        <p className="mt-5 rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-200">
          Australian box-office data is temporarily unavailable.
        </p>
      ) : !view ? (
        <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950/70 p-5">
          <p className="text-sm text-zinc-300">No local snapshot yet.</p>
          <p className="mt-2 font-mono text-xs text-zinc-500">
            Run npm run ingest:screenaustralia
          </p>
        </div>
      ) : (
        <>
          <div
            className="mt-5 flex flex-wrap gap-2"
            role="tablist"
            aria-label="Screen Australia box-office views"
          >
            {views.map((candidate) => (
              <button
                key={candidate.periodType}
                type="button"
                role="tab"
                aria-selected={candidate.periodType === view.periodType}
                onClick={() => setSelectedType(candidate.periodType)}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  candidate.periodType === view.periodType
                    ? "border-cyan-700 bg-cyan-950 text-cyan-200"
                    : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                }`}
              >
                {LABELS[candidate.periodType]}
              </button>
            ))}
          </div>

          {view.stale ? (
            <p className="mt-4 rounded-xl border border-amber-900/50 bg-amber-950/20 p-3 text-xs leading-5 text-amber-200">
              Source report warning: the latest published report is{" "}
              {view.ageDays} days old. Retrieval may be current while the source
              data remains stale.
            </p>
          ) : null}
          {lastRunFailed ? (
            <p className="mt-3 rounded-xl border border-red-900/50 bg-red-950/20 p-3 text-xs text-red-200">
              The latest scheduled fetch or parser run failed. The last valid
              snapshot remains displayed.
            </p>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <caption className="sr-only">
                {LABELS[view.periodType]} from Screen Australia
              </caption>
              <thead className="border-b border-zinc-800 text-xs text-zinc-500">
                <tr>
                  <th className="px-3 py-3 font-medium" scope="col">
                    Rank
                  </th>
                  <th className="px-3 py-3 font-medium" scope="col">
                    Title
                  </th>
                  <th className="px-3 py-3 text-right font-medium" scope="col">
                    {GROSS_LABELS[view.periodType]}
                  </th>
                  <th className="px-3 py-3 text-right font-medium" scope="col">
                    Cumulative gross
                  </th>
                  <th className="px-3 py-3 text-right font-medium" scope="col">
                    Release period
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {view.rows.map((row) => (
                  <tr key={`${row.rank}:${row.title}`}>
                    <td className="px-3 py-3 font-mono text-zinc-500">
                      #{row.rank}
                    </td>
                    <td className="px-3 py-3 font-medium text-zinc-200">
                      {row.title}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-zinc-200">
                      {aud(row.periodGrossAud)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-zinc-400">
                      {aud(row.cumulativeGrossAud)}
                    </td>
                    <td className="px-3 py-3 text-right text-zinc-500">
                      {row.releaseWeeks ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="mt-5 grid gap-2 border-t border-cyan-950 pt-4 text-xs text-zinc-500 sm:grid-cols-3">
        <p>Source report: {view ? date(view.reportDate) : "Unavailable"}</p>
        <p>Last successful fetch: {date(lastSuccessfulAt)}</p>
        <p>Next scheduled refresh: {date(nextScheduledAt)}</p>
      </div>
      <p className="mt-3 max-w-5xl text-xs leading-5 text-zinc-600">
        Public widget HTML · one bounded request per weekly refresh · no archive
        crawling. These are ranked title lists, not a complete Australian market
        total. Local longitudinal history starts with the first ingested
        snapshot. Public deployment and republication rights require
        reassessment.
      </p>
    </section>
  );
}
