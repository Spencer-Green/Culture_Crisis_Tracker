import type { FredSeriesMetadata } from "@/data-sources/macro/fred-api";
import { FredResponseError } from "@/data-sources/macro/fred-api";
import type { FredMetricDefinition } from "@/data-sources/macro/fred-metrics";
import {
  normaliseFredPeriod,
  parseFredDate,
} from "@/data-sources/macro/fred-period";
import {
  normalisedObservationSchema,
  type NormalisedObservation,
} from "@/data-sources/types";

function normaliseDecimal(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "." || trimmed === "") return null;
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match)
    throw new FredResponseError("FRED returned a non-numeric observation.");
  const fraction = match[3] ?? "";
  if (fraction.length <= 6) {
    return `${match[1]}${match[2]}${fraction ? `.${fraction.replace(/0+$/, "")}` : ""}`.replace(
      /\.$/,
      "",
    );
  }
  const kept = fraction.slice(0, 6).split("").map(Number);
  let carry = Number(fraction[6]) >= 5 ? 1 : 0;
  for (let index = kept.length - 1; index >= 0 && carry; index -= 1) {
    const next = kept[index] + carry;
    kept[index] = next % 10;
    carry = next >= 10 ? 1 : 0;
  }
  const integer = (BigInt(match[2]) + BigInt(carry)).toString();
  const roundedFraction = kept.join("").replace(/0+$/, "");
  return `${match[1]}${integer}${roundedFraction ? `.${roundedFraction}` : ""}`;
}

function notesSummary(notes: string): string | null {
  const summary = notes
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return summary ? summary.slice(0, 500) : null;
}

export function parseFredObservations(
  payload: Record<string, unknown>,
  metric: FredMetricDefinition,
  series: FredSeriesMetadata,
  requestUrl: string,
  retrievedAt: Date,
  startDate: Date,
  endDate: Date,
): NormalisedObservation[] {
  if (!Array.isArray(payload.observations)) {
    throw new FredResponseError("FRED returned no observation data.");
  }
  const observations = new Map<string, NormalisedObservation>();
  for (const value of payload.observations) {
    if (!value || typeof value !== "object") {
      throw new FredResponseError("FRED returned an invalid observation.");
    }
    const record = value as Record<string, unknown>;
    if (typeof record.date !== "string" || typeof record.value !== "string") {
      throw new FredResponseError("FRED returned an invalid observation.");
    }
    const originalDate = parseFredDate(record.date);
    if (originalDate < startDate || originalDate > endDate) continue;
    const decimal = normaliseDecimal(record.value);
    if (decimal === null) continue;
    const period = normaliseFredPeriod(record.date, metric.periodType);
    observations.set(
      period.periodStart.toISOString(),
      normalisedObservationSchema.parse({
        metricSlug: metric.slug,
        countryCode: metric.countryCode,
        sectorSlug: metric.sectorSlug,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        value: decimal,
        sourceUrl: requestUrl,
        retrievedAt,
        metadata: {
          seriesId: metric.seriesId,
          title: series.title,
          source: metric.source,
          release: metric.release,
          frequency: series.frequency,
          units: series.units,
          seasonalAdjustment: series.seasonalAdjustment,
          lastUpdated: series.lastUpdated,
          originalObservationDate: record.date,
          realtimeStart:
            typeof record.realtime_start === "string"
              ? record.realtime_start
              : null,
          realtimeEnd:
            typeof record.realtime_end === "string"
              ? record.realtime_end
              : null,
          measureType: metric.measureType,
          presentationRole: metric.presentationRole,
          normalizationPurpose: metric.normalizationPurpose ?? null,
          distributor: "Federal Reserve Economic Data (FRED)",
          sourceSemantics: metric.sourceSemantics,
          sourceNotes: notesSummary(series.notes),
          requestUrl,
          retrievedAt: retrievedAt.toISOString(),
        },
      }),
    );
  }
  return [...observations.values()].sort(
    (left, right) => left.periodStart.getTime() - right.periodStart.getTime(),
  );
}
