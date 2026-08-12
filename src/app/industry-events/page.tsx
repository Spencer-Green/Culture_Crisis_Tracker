import type { Metadata } from "next";
import Link from "next/link";

import { GDELT_EVENT_TYPES } from "@/data-sources/news/gdelt-taxonomy";
import { COUNTRIES, SECTORS } from "@/lib/constants";
import {
  buildGdeltCorpusStats,
  type IndustryEventFilters,
} from "@/services/industry-events/events-core";
import { getIndustryEventCandidates } from "@/services/industry-events/events";
import { getTicketmasterSupply } from "@/services/industry-events/ticketmaster-supply";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Industry Events" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function filtersFromSearchParams(
  searchParams: Awaited<SearchParams>,
): IndustryEventFilters {
  const daysValue = first(searchParams.days);
  const days = daysValue === "7" ? 7 : daysValue === "all" ? null : 30;
  const polarity = first(searchParams.polarity);
  const confidenceLevel = first(searchParams.confidence);
  const reviewState = first(searchParams.review);
  return {
    days,
    countryCode: first(searchParams.country) || undefined,
    sectorSlug: first(searchParams.sector) || undefined,
    eventType: first(searchParams.eventType) || undefined,
    polarity:
      polarity === "negative" ||
      polarity === "positive" ||
      polarity === "neutral/ambiguous"
        ? polarity
        : undefined,
    confidenceLevel:
      confidenceLevel === "low" ||
      confidenceLevel === "medium" ||
      confidenceLevel === "high"
        ? confidenceLevel
        : undefined,
    reviewState:
      reviewState === "unreviewed" ||
      reviewState === "accepted" ||
      reviewState === "rejected"
        ? reviewState
        : undefined,
    domain: first(searchParams.domain) || undefined,
  };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function label(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ").toLowerCase();
}

function Select({
  labelText,
  name,
  defaultValue,
  children,
}: {
  labelText: string;
  name: string;
  defaultValue?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1.5 text-xs text-zinc-500">
      <span>{labelText}</span>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300"
      >
        {children}
      </select>
    </label>
  );
}

export default async function IndustryEventsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const resolvedSearchParams = await searchParams;
  const filters = filtersFromSearchParams(resolvedSearchParams);
  const supplyDaysValue = first(resolvedSearchParams.supplyDays);
  const supplyDays =
    supplyDaysValue === "7" ? 7 : supplyDaysValue === "90" ? 90 : 30;
  const supplyCountry = first(resolvedSearchParams.supplyCountry) || undefined;
  const supplySegment = first(resolvedSearchParams.supplySegment) || undefined;
  const [candidates, supply] = await Promise.all([
    getIndustryEventCandidates(filters),
    getTicketmasterSupply({
      days: supplyDays,
      countryCode: supplyCountry,
      segmentName: supplySegment,
    }),
  ]);
  const stats = buildGdeltCorpusStats(candidates);
  const maxWeeklyEvents = Math.max(
    1,
    ...supply.weeks.map((week) => week.events),
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="font-data text-xs tracking-[0.2em] text-blue-400 uppercase">
          Evidence corpus
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
          Industry Events
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          Structured forward live-event supply from Ticketmaster and a separate
          GDELT media-candidate corpus. Neither produces an Industry Viability
          score yet.
        </p>
      </div>

      <section className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-data text-xs tracking-[0.16em] text-emerald-400 uppercase">
              Live Event Supply
            </p>
            <h2 className="mt-2 text-xl font-semibold text-zinc-100">
              Ticketmaster-covered forward calendar
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
              Discovery API listings are a structured supply snapshot, not a
              census of all cultural events or evidence of historical trend.
            </p>
            {supply.snapshotRetrievedAt ? (
              <p className="font-data mt-2 text-xs text-zinc-600">
                Latest complete snapshot:{" "}
                {formatDate(supply.snapshotRetrievedAt.toISOString())}
              </p>
            ) : null}
          </div>
          <div className="flex gap-2">
            {[7, 30, 90].map((days) => (
              <Link
                key={days}
                href={`/industry-events?supplyDays=${days}`}
                className={`rounded-lg border px-3 py-2 text-xs ${
                  supplyDays === days
                    ? "border-emerald-800 bg-emerald-950/50 text-emerald-300"
                    : "border-zinc-800 text-zinc-500"
                }`}
              >
                {days}D
              </Link>
            ))}
          </div>
        </div>

        <form className="grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="supplyDays" value={supplyDays} />
          <Select
            labelText="Supply country"
            name="supplyCountry"
            defaultValue={supplyCountry}
          >
            <option value="">All four markets</option>
            {COUNTRIES.filter((country) =>
              ["AU", "US", "GB", "CA"].includes(country.code),
            ).map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </Select>
          <Select
            labelText="Ticketmaster segment"
            name="supplySegment"
            defaultValue={supplySegment}
          >
            <option value="">All cultural segments</option>
            <option value="Music">Music</option>
            <option value="Arts & Theatre">Arts &amp; Theatre</option>
            <option value="Film">Film</option>
          </Select>
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
            >
              Apply supply filters
            </button>
          </div>
        </form>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(
            [
              ["AU", "Australia"],
              ["US", "United States"],
              ["GB", "United Kingdom"],
              ["CA", "Canada"],
            ] as const
          ).map(([code, name]) => {
            const country = supply.countries[code];
            return (
              <div
                key={code}
                className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
              >
                <p className="text-sm font-medium text-zinc-200">{name}</p>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-zinc-600">Events</dt>
                    <dd className="font-data mt-1 text-lg text-zinc-200">
                      {country.events}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-600">Active venues</dt>
                    <dd className="font-data mt-1 text-lg text-zinc-200">
                      {country.venues}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-600">Events / venue</dt>
                    <dd className="font-data mt-1 text-zinc-300">
                      {country.eventsPerVenue?.toFixed(1) ?? "N/A"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-600">Music</dt>
                    <dd className="font-data mt-1 text-zinc-300">
                      {country.segments.Music ?? 0}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-600">Arts &amp; Theatre</dt>
                    <dd className="font-data mt-1 text-zinc-300">
                      {country.segments["Arts & Theatre"] ?? 0}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-600">Film</dt>
                    <dd className="font-data mt-1 text-zinc-300">
                      {country.segments.Film ?? 0}
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <h3 className="text-sm font-medium text-zinc-200">
              Upcoming events by week
            </h3>
            <div className="mt-4 space-y-3">
              {supply.weeks.length === 0 ? (
                <p className="text-sm text-zinc-600">
                  No persisted Ticketmaster events in this forward window.
                </p>
              ) : (
                supply.weeks.map((week) => (
                  <div
                    key={week.weekStart}
                    className="grid grid-cols-[6rem_1fr_3rem] items-center gap-3 text-xs"
                  >
                    <span className="font-data text-zinc-500">
                      {week.weekStart}
                    </span>
                    <span className="h-2 overflow-hidden rounded-full bg-zinc-900">
                      <span
                        className="block h-full rounded-full bg-emerald-600"
                        style={{
                          width: `${(week.events / maxWeeklyEvents) * 100}%`,
                        }}
                      />
                    </span>
                    <span className="font-data text-right text-zinc-300">
                      {week.events}
                    </span>
                  </div>
                ))
              )}
            </div>
            <p className="mt-4 text-xs leading-5 text-zinc-600">
              Farther-out weeks may be less complete because events have not yet
              been listed. This is forward calendar shape, not a trend.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <h3 className="text-sm font-medium text-zinc-200">
              Current source status
            </h3>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
              {[
                ["On sale", supply.summary.statuses.onsale ?? 0],
                ["Off sale", supply.summary.statuses.offsale ?? 0],
                ["Cancelled", supply.summary.statuses.cancelled ?? 0],
                ["Canceled", supply.summary.statuses.canceled ?? 0],
                ["Postponed", supply.summary.statuses.postponed ?? 0],
                ["Rescheduled", supply.summary.statuses.rescheduled ?? 0],
                [
                  "Price coverage",
                  supply.summary.priceCoveragePercent === null
                    ? "N/A"
                    : `${supply.summary.priceCoveragePercent.toFixed(1)}%`,
                ],
              ].map(([name, value]) => (
                <div
                  key={name}
                  className="rounded-lg border border-zinc-800 p-3"
                >
                  <dt className="text-zinc-600">{name}</dt>
                  <dd className="font-data mt-1 text-zinc-300">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs leading-5 text-zinc-600">
              Ticketmaster currently returns the exact{" "}
              <code className="font-data">cancelled</code> spelling in this
              corpus; any <code className="font-data">canceled</code> value
              remains separate. Off sale is not cancellation. A cancelled
              listing in one snapshot is not a newly observed cancellation;
              transition analysis uses recurring snapshots.
            </p>
          </div>
        </div>
      </section>

      <div className="pt-3">
        <p className="font-data text-xs tracking-[0.16em] text-blue-400 uppercase">
          Media Event Candidates
        </p>
        <h2 className="mt-2 text-xl font-semibold text-zinc-100">GDELT</h2>
      </div>

      <div className="rounded-2xl border border-blue-900/50 bg-blue-950/20 p-5 text-sm leading-6 text-blue-200/80">
        Article matching is evidence discovery, not ground truth. Several
        articles may describe one event, and low-confidence matches may be
        incidental.
      </div>

      <form className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 sm:grid-cols-2 xl:grid-cols-4">
        <Select
          labelText="Date range"
          name="days"
          defaultValue={filters.days?.toString() ?? "all"}
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="all">All ingested</option>
        </Select>
        <Select
          labelText="Country"
          name="country"
          defaultValue={filters.countryCode}
        >
          <option value="">All / unknown</option>
          {COUNTRIES.filter((country) =>
            ["AU", "US", "GB", "CA"].includes(country.code),
          ).map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </Select>
        <Select
          labelText="Sector"
          name="sector"
          defaultValue={filters.sectorSlug}
        >
          <option value="">All sectors</option>
          {SECTORS.filter((sector) =>
            ["music", "film", "theatre", "gaming", "industry-events"].includes(
              sector.slug,
            ),
          ).map((sector) => (
            <option key={sector.slug} value={sector.slug}>
              {sector.name}
            </option>
          ))}
        </Select>
        <Select
          labelText="Event type"
          name="eventType"
          defaultValue={filters.eventType}
        >
          <option value="">All event types</option>
          {GDELT_EVENT_TYPES.map((eventType) => (
            <option key={eventType} value={eventType}>
              {label(eventType)}
            </option>
          ))}
        </Select>
        <Select
          labelText="Polarity"
          name="polarity"
          defaultValue={filters.polarity}
        >
          <option value="">All polarities</option>
          <option value="negative">Negative</option>
          <option value="positive">Positive</option>
          <option value="neutral/ambiguous">Neutral / ambiguous</option>
        </Select>
        <Select
          labelText="Confidence"
          name="confidence"
          defaultValue={filters.confidenceLevel}
        >
          <option value="">All confidence levels</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>
        <Select
          labelText="Review state"
          name="review"
          defaultValue={filters.reviewState}
        >
          <option value="">All review states</option>
          <option value="unreviewed">Unreviewed</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
        </Select>
        <label className="space-y-1.5 text-xs text-zinc-500">
          <span>Source / domain</span>
          <input
            name="domain"
            defaultValue={filters.domain}
            placeholder="example.com"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300"
          />
        </label>
        <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-4">
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
            type="submit"
          >
            Apply filters
          </button>
          <Link
            className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
            href="/industry-events"
          >
            Reset
          </Link>
        </div>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Candidates", stats.total],
          ["Negative", stats.negative],
          ["Positive", stats.positive],
          ["High confidence", stats.highConfidence],
          ["Countries assigned", stats.countriesCovered],
        ].map(([name, value]) => (
          <div
            key={name}
            className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4"
          >
            <p className="text-xs text-zinc-500">{name}</p>
            <p className="font-data mt-2 text-xl text-zinc-100">{value}</p>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        {candidates.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 px-5 py-12 text-center text-sm text-zinc-500">
            No candidates match these filters.
          </div>
        ) : (
          candidates.map((candidate) => (
            <article
              key={candidate.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full border border-blue-900 bg-blue-950/50 px-2 py-1 text-blue-300">
                      GDELT candidate
                    </span>
                    <span className="rounded-full border border-zinc-700 px-2 py-1 text-zinc-400">
                      {label(candidate.eventType)}
                    </span>
                    <span className="rounded-full border border-zinc-700 px-2 py-1 text-zinc-400">
                      {candidate.confidenceLevel} confidence
                    </span>
                    <span className="rounded-full border border-zinc-700 px-2 py-1 text-zinc-400">
                      {candidate.polarity}
                    </span>
                    <span className="rounded-full border border-zinc-700 px-2 py-1 text-zinc-400">
                      {candidate.reviewState}
                    </span>
                  </div>
                  <h2 className="mt-3 text-base leading-6 font-medium text-zinc-100">
                    {candidate.title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-500">
                    {candidate.classificationRationale}
                  </p>
                </div>
                <a
                  href={candidate.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-sm text-blue-400 hover:text-blue-300"
                >
                  Open article ↗
                </a>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-zinc-800 pt-4 text-xs text-zinc-500">
                <span>{candidate.domain}</span>
                <span>{formatDate(candidate.publishedAt)}</span>
                <span>{candidate.countryCode ?? "event country unknown"}</span>
                <span>{candidate.sectorSlug}</span>
                <span>
                  source country: {candidate.sourceCountry ?? "unknown"}
                </span>
                <span>queries: {candidate.queryFamilies.join(", ")}</span>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
