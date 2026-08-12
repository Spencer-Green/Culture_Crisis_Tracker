import type { TicketmasterCountryCode } from "@/data-sources/entertainment/ticketmaster-types";

export type TicketmasterSupplyRecord = {
  ticketmasterId: string;
  countryCode: string;
  sectorSlug: string;
  segmentName: string;
  genreName: string | null;
  status: string;
  localDate: string;
  eventDateTime: Date | null;
  venueId: string | null;
  priceMin: { toString(): string } | number | null;
  priceMax: { toString(): string } | number | null;
};

export type TicketmasterSupplySummary = {
  events: number;
  venues: number;
  eventsPerVenue: number | null;
  priceRangeEvents: number;
  priceCoveragePercent: number | null;
  statuses: Record<string, number>;
  segments: Record<string, number>;
  genres: Record<string, number>;
};

export function isCompleteTicketmasterSnapshotMetadata(
  value: unknown,
): value is {
  countries: string[];
  segments: string[];
  days?: number;
  retrievedAt?: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const metadata = value as Record<string, unknown>;
  if (!Array.isArray(metadata.countries) || !Array.isArray(metadata.segments))
    return false;
  const countries = metadata.countries;
  const segments = metadata.segments;
  return (
    ["AU", "US", "GB", "CA"].every((country) => countries.includes(country)) &&
    ["music", "arts-theatre", "film"].every((segment) =>
      segments.includes(segment),
    )
  );
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort());
}

export function summarizeTicketmasterSupply(
  records: readonly TicketmasterSupplyRecord[],
): TicketmasterSupplySummary {
  const venues = new Set(
    records.map((record) => record.venueId).filter(Boolean),
  );
  const priceRangeEvents = records.filter(
    (record) => record.priceMin !== null || record.priceMax !== null,
  ).length;
  return {
    events: records.length,
    venues: venues.size,
    eventsPerVenue: venues.size > 0 ? records.length / venues.size : null,
    priceRangeEvents,
    priceCoveragePercent:
      records.length > 0 ? (priceRangeEvents / records.length) * 100 : null,
    statuses: countBy(records.map((record) => record.status)),
    segments: countBy(records.map((record) => record.segmentName)),
    genres: countBy(records.map((record) => record.genreName ?? "Unknown")),
  };
}

export function groupTicketmasterEventsByWeek(
  records: readonly TicketmasterSupplyRecord[],
): { weekStart: string; events: number }[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    const date =
      record.eventDateTime ?? new Date(`${record.localDate}T12:00:00Z`);
    const day = date.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() + mondayOffset,
      ),
    );
    const key = monday.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([weekStart, events]) => ({ weekStart, events }));
}

export function ticketmasterCountrySummaries(
  records: readonly TicketmasterSupplyRecord[],
): Record<TicketmasterCountryCode, TicketmasterSupplySummary> {
  return Object.fromEntries(
    (["AU", "US", "GB", "CA"] as const).map((countryCode) => [
      countryCode,
      summarizeTicketmasterSupply(
        records.filter((record) => record.countryCode === countryCode),
      ),
    ]),
  ) as Record<TicketmasterCountryCode, TicketmasterSupplySummary>;
}
