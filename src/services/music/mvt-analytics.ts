import type { MVTUnprofitabilityDefinition } from "@/data-sources/music/mvt-types";

export type MVTYearValue = {
  year: number;
  venueCount: number | null;
  permanentClosures: number | null;
  venuesNoLongerOperating: number | null;
  venuesUnprofitablePct: number | null;
  unprofitabilityDefinition: MVTUnprofitabilityDefinition | null;
  averageProfitMarginPct: number | null;
  eventCount: number | null;
  ticketedLiveMusicEvents: number | null;
  audienceVisits: number | null;
  totalSectorRevenueGbp: number | null;
  liveMusicIncomeGbp: number | null;
  employment: number | null;
  jobsLost: number | null;
  townsWithoutRegularTouring: number | null;
};

function percentChange(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function buildMVTAnalytics(input: readonly MVTYearValue[]) {
  const records = [...input].sort((left, right) => left.year - right.year);
  const latest = records.at(-1);
  if (!latest) return null;
  const previous =
    records.find((record) => record.year === latest.year - 1) ?? null;
  const comparableUnprofitability =
    previous !== null &&
    latest.unprofitabilityDefinition !== null &&
    latest.unprofitabilityDefinition === previous.unprofitabilityDefinition;
  return {
    latest,
    previous,
    venueCountYoyPct: percentChange(
      latest.venueCount,
      previous?.venueCount ?? null,
    ),
    eventCountYoyPct: percentChange(
      latest.eventCount,
      previous?.eventCount ?? null,
    ),
    audienceYoyPct: percentChange(
      latest.audienceVisits,
      previous?.audienceVisits ?? null,
    ),
    revenueYoyPct: percentChange(
      latest.totalSectorRevenueGbp,
      previous?.totalSectorRevenueGbp ?? null,
    ),
    employmentYoyPct: percentChange(
      latest.employment,
      previous?.employment ?? null,
    ),
    unprofitabilityYoyPp: comparableUnprofitability
      ? latest.venuesUnprofitablePct! - previous.venuesUnprofitablePct!
      : null,
    unprofitabilityComparable: comparableUnprofitability,
    chart: records.map((record) => ({
      year: record.year,
      venues: record.venueCount,
      closures: record.permanentClosures,
      unprofitablePct: record.venuesUnprofitablePct,
      profitMarginPct: record.averageProfitMarginPct,
      events: record.eventCount,
      employment: record.employment,
    })),
  };
}
