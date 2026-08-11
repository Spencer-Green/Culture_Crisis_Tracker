import { z } from "zod";

import type { OnsResolvedSeries } from "@/data-sources/macro/ons-api";
import type { OnsMetricDefinition } from "@/data-sources/macro/ons-metrics";
import {
  formatOnsQuarter,
  getOnsQuarterBoundaries,
} from "@/data-sources/macro/ons-period";
import {
  normalisedObservationSchema,
  type NormalisedObservation,
} from "@/data-sources/types";

const onsPeriodSchema = z.object({
  date: z.string(),
  value: z.string().nullable().optional(),
  label: z.string(),
  year: z.string().regex(/^\d{4}$/),
  month: z.string().optional().default(""),
  quarter: z.string().regex(/^Q[1-4]$/),
  sourceDataset: z.string(),
  updateDate: z.string().datetime().optional(),
});

const onsDescriptionSchema = z.object({
  title: z.string(),
  releaseDate: z.string().datetime().optional(),
  nextRelease: z.string().optional(),
  datasetId: z.string(),
  cdid: z.string(),
  unit: z.string(),
  preUnit: z.string().optional().default(""),
  date: z.string().optional(),
  number: z.string().optional(),
});

const onsTimeSeriesResponseSchema = z.object({
  years: z.array(z.unknown()).optional().default([]),
  quarters: z.array(onsPeriodSchema),
  months: z.array(z.unknown()).optional().default([]),
  uri: z.string().startsWith("/"),
  type: z.literal("timeseries"),
  description: onsDescriptionSchema,
});

type OnsTimeSeriesResponse = z.infer<typeof onsTimeSeriesResponseSchema>;
type OnsQuarter = z.infer<typeof onsPeriodSchema>;

export type OnsSeriesSummary = {
  cdid: string;
  title: string;
  datasetId: string;
  uri: string;
  unit: string;
  releaseDate: string | null;
  nextRelease: string | null;
  earliestQuarter: string | null;
  latestQuarter: string | null;
  quarterlyObservationCount: number;
  annualObservationCount: number;
  monthlyObservationCount: number;
};

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("ONS returned malformed time-series JSON.");
  }
}

function parseOnsTimeSeries(body: string): OnsTimeSeriesResponse {
  return onsTimeSeriesResponseSchema.parse(parseJson(body));
}

function canonicalQuarter(period: OnsQuarter): string {
  return `${period.year}-${period.quarter}`;
}

function validateIdentity(
  response: OnsTimeSeriesResponse,
  series: OnsResolvedSeries,
  metric: OnsMetricDefinition,
): void {
  if (
    response.description.cdid !== metric.cdid ||
    response.description.datasetId !== metric.datasetId ||
    response.description.title !== metric.expectedTitle ||
    response.uri !== series.uri
  ) {
    throw new Error(
      `ONS data response identity did not match the verified ${metric.cdid}/${metric.datasetId} mapping.`,
    );
  }
}

function distinctSortedQuarters(quarters: readonly OnsQuarter[]): OnsQuarter[] {
  const byQuarter = new Map<string, OnsQuarter>();
  for (const quarter of quarters) {
    byQuarter.set(canonicalQuarter(quarter), quarter);
  }

  return [...byQuarter.values()].sort(
    (left, right) =>
      getOnsQuarterBoundaries(canonicalQuarter(left)).periodStart.getTime() -
      getOnsQuarterBoundaries(canonicalQuarter(right)).periodStart.getTime(),
  );
}

function normaliseNumericValue(
  value: string | null | undefined,
  period: string,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "-" || trimmed === "..") {
    return null;
  }

  const normalised = trimmed.replaceAll(",", "");
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(normalised)) {
    throw new Error(`ONS returned a non-numeric value for ${period}.`);
  }

  return normalised;
}

export function parseOnsSeriesSummary(
  body: string,
  series: OnsResolvedSeries,
  metric: OnsMetricDefinition,
): OnsSeriesSummary {
  const response = parseOnsTimeSeries(body);
  validateIdentity(response, series, metric);
  const quarters = distinctSortedQuarters(response.quarters);

  return {
    cdid: response.description.cdid,
    title: response.description.title,
    datasetId: response.description.datasetId,
    uri: response.uri,
    unit: `${response.description.preUnit}${response.description.unit}`,
    releaseDate: response.description.releaseDate ?? series.releaseDate ?? null,
    nextRelease: response.description.nextRelease ?? null,
    earliestQuarter: quarters.length > 0 ? canonicalQuarter(quarters[0]) : null,
    latestQuarter:
      quarters.length > 0
        ? canonicalQuarter(quarters[quarters.length - 1])
        : null,
    quarterlyObservationCount: quarters.length,
    annualObservationCount: response.years.length,
    monthlyObservationCount: response.months.length,
  };
}

export function parseOnsObservations(
  body: string,
  series: OnsResolvedSeries,
  metric: OnsMetricDefinition,
  requestUrl: string,
  retrievedAt: Date,
  startDate: Date,
  endDate: Date,
): NormalisedObservation[] {
  const response = parseOnsTimeSeries(body);
  validateIdentity(response, series, metric);
  const startQuarter = formatOnsQuarter(startDate);
  const endQuarter = formatOnsQuarter(endDate);
  const observations: NormalisedObservation[] = [];

  for (const period of distinctSortedQuarters(response.quarters)) {
    const quarter = canonicalQuarter(period);
    if (quarter < startQuarter || quarter > endQuarter) {
      continue;
    }

    const value = normaliseNumericValue(period.value, quarter);
    if (value === null) {
      continue;
    }

    const boundaries = getOnsQuarterBoundaries(quarter);
    observations.push(
      normalisedObservationSchema.parse({
        metricSlug: metric.slug,
        countryCode: metric.countryCode,
        sectorSlug: metric.sectorSlug,
        periodStart: boundaries.periodStart,
        periodEnd: boundaries.periodEnd,
        value,
        sourceUrl: requestUrl,
        retrievedAt,
        metadata: {
          source: "ONS",
          datasetId: response.description.datasetId,
          datasetEdition: series.edition,
          cdid: response.description.cdid,
          title: response.description.title,
          onsUri: response.uri,
          requestUrl,
          originalPeriodLabel: period.label,
          frequency: "quarterly",
          rawUnit: response.description.unit,
          rawPreUnit: response.description.preUnit,
          metricUnit: metric.unit,
          priceBasis: metric.priceBasis,
          seasonallyAdjusted: metric.seasonallyAdjusted,
          domesticConcept: metric.domesticConcept,
          coicopDivision: metric.coicopDivision,
          releaseDate:
            response.description.releaseDate ?? series.releaseDate ?? null,
          nextRelease: response.description.nextRelease ?? null,
          observationUpdateDate: period.updateDate ?? null,
          referenceYear: null,
          retrievedAt: retrievedAt.toISOString(),
        },
      }),
    );
  }

  return observations;
}
