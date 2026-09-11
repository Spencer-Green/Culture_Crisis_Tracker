import type { Metadata } from "next";
import Link from "next/link";

import { COUNTRIES } from "@/lib/constants";
import { getTicketmasterSupplyTrends } from "@/services/industry-events/ticketmaster-longitudinal";
import { getTicketmasterSupply } from "@/services/industry-events/ticketmaster-supply";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Scheduled Activity" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatTrend(value: number | null): string {
  if (value === null) return "Insufficient history";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
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
  const supplyDaysValue = first(resolvedSearchParams.supplyDays);
  const supplyDays =
    supplyDaysValue === "7" ? 7 : supplyDaysValue === "90" ? 90 : 30;
  const supplyCountry = first(resolvedSearchParams.supplyCountry) || undefined;
  const supplySegment = first(resolvedSearchParams.supplySegment) || undefined;
  const [supply, trends] = await Promise.all([
    getTicketmasterSupply({
      days: supplyDays,
      countryCode: supplyCountry,
      segmentName: supplySegment,
    }),
    getTicketmasterSupplyTrends({
      windowDays: supplyDays,
      countryCode: supplyCountry,
      segmentName: supplySegment,
    }),
  ]);

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
          Scheduled Activity
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          Scheduled performances and forward supply from Ticketmaster. Listings
          are not documented industry developments or realized demand.
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
                href={`/activity?supplyDays=${days}`}
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

      <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-5">
        <div>
          <p className="font-data text-xs tracking-[0.16em] text-violet-400 uppercase">
            Supply Trends
          </p>
          <h2 className="mt-2 text-xl font-semibold text-zinc-100">
            {trends.hasComparableHistory
              ? `${supplyDays}-day forward supply change`
              : "Collecting longitudinal history"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
            Changes appear only after equivalent country, Ticketmaster segment,
            and forward-window snapshots have accumulated. Missing listings and
            events aging out are not cancellations.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {trends.entries.map((entry) => {
            const countryName =
              COUNTRIES.find((country) => country.code === entry.countryCode)
                ?.name ?? entry.countryCode;
            const transitions = entry.transitionCounts ?? {};
            return (
              <div
                key={entry.countryCode}
                className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
              >
                <p className="text-sm font-medium text-zinc-200">
                  {countryName}
                </p>
                <p className="mt-1 text-xs text-zinc-600">
                  {trends.segmentName} · {supplyDays}D
                </p>
                <dl className="mt-4 space-y-2 text-xs">
                  {[
                    [
                      "Forward supply",
                      formatTrend(
                        entry.comparison?.eventCountPctChange ?? null,
                      ),
                    ],
                    [
                      "Active venues",
                      formatTrend(
                        entry.comparison?.activeVenuePctChange ?? null,
                      ),
                    ],
                    [
                      "Events / venue",
                      formatTrend(
                        entry.comparison?.eventsPerVenuePctChange ?? null,
                      ),
                    ],
                    ["New listings", "Insufficient history"],
                    [
                      "Cancellation transitions",
                      entry.comparison
                        ? (transitions["onsale → cancelled"] ?? 0) +
                          (transitions["onsale → canceled"] ?? 0)
                        : "Insufficient history",
                    ],
                    [
                      "Postponement transitions",
                      entry.comparison
                        ? (transitions["onsale → postponed"] ?? 0)
                        : "Insufficient history",
                    ],
                    [
                      "Reschedule transitions",
                      entry.comparison
                        ? (transitions["postponed → rescheduled"] ?? 0)
                        : "Insufficient history",
                    ],
                  ].map(([name, value]) => (
                    <div key={name} className="flex justify-between gap-3">
                      <dt className="text-zinc-600">{name}</dt>
                      <dd className="font-data text-right text-zinc-300">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
        </div>
        {!trends.hasSnapshots ? (
          <p className="text-xs text-zinc-600">
            No persisted longitudinal baseline is available yet.
          </p>
        ) : !trends.hasComparableHistory ? (
          <p className="text-xs text-zinc-600">
            One baseline exists. A later comparable snapshot is required before
            change metrics can be calculated.
          </p>
        ) : null}
      </section>
    </div>
  );
}
