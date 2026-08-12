import {
  parseStatCanResponseObject,
  StatCanResponseError,
  type StatCanSeriesInfo,
} from "@/data-sources/macro/statcan-api";
import type { StatCanMetricDefinition } from "@/data-sources/macro/statcan-metrics";
import {
  formatStatCanQuarter,
  getStatCanQuarterBoundaries,
} from "@/data-sources/macro/statcan-period";
import {
  normalisedObservationSchema,
  type NormalisedObservation,
} from "@/data-sources/types";

function decimalString(value: number): string {
  const direct = String(value);
  return /[eE]/.test(direct)
    ? value.toFixed(12).replace(/0+$/, "").replace(/\.$/, "")
    : direct;
}

export function parseStatCanObservations(
  payload: unknown,
  metric: StatCanMetricDefinition,
  series: StatCanSeriesInfo,
  sourceUrl: string,
  retrievedAt: Date,
  startDate: Date,
  endDate: Date,
): NormalisedObservation[] {
  const object = parseStatCanResponseObject(payload);
  if (
    Number(object.productId) !== 36100124 ||
    Number(object.vectorId) !== metric.vectorId ||
    String(object.coordinate) !== metric.coordinate ||
    !Array.isArray(object.vectorDataPoint)
  ) {
    throw new StatCanResponseError(
      "Statistics Canada vector response does not match the requested series.",
    );
  }

  const observations = new Map<string, NormalisedObservation>();
  for (const raw of object.vectorDataPoint) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new StatCanResponseError(
        "Statistics Canada returned an invalid data point.",
      );
    }
    const point = raw as Record<string, unknown>;
    if (point.value === null || point.value === undefined) continue;
    if (typeof point.value !== "number" || !Number.isFinite(point.value)) {
      throw new StatCanResponseError(
        "Statistics Canada returned a non-numeric observation.",
      );
    }
    if (
      Number(point.frequencyCode) !== 9 ||
      Number(point.scalarFactorCode) !== 6 ||
      typeof point.refPer !== "string"
    ) {
      throw new StatCanResponseError(
        "Statistics Canada observation semantics do not match the metric.",
      );
    }
    const periodDate = new Date(`${point.refPer}T00:00:00.000Z`);
    if (
      Number.isNaN(periodDate.getTime()) ||
      periodDate < startDate ||
      periodDate > endDate
    ) {
      continue;
    }
    const quarter = formatStatCanQuarter(periodDate);
    const { periodStart, periodEnd } = getStatCanQuarterBoundaries(quarter);
    observations.set(
      periodStart.toISOString(),
      normalisedObservationSchema.parse({
        metricSlug: metric.slug,
        countryCode: "CA",
        sectorSlug: "consumer-spending",
        periodStart,
        periodEnd,
        value: decimalString(point.value),
        sourceUrl,
        retrievedAt,
        metadata: {
          tableNumber: "36-10-0124-01",
          productId: 36100124,
          coordinate: metric.coordinate,
          vectorId: metric.vectorId,
          seriesTitle: series.seriesTitle,
          geography: "Canada",
          categoryMemberId: metric.categoryMemberId,
          categoryLabel: metric.categoryLabel,
          priceMemberId: metric.priceMemberId,
          priceLabel: metric.priceLabel,
          priceBasis: metric.priceBasis,
          seasonalAdjustment: metric.seasonalAdjustment,
          quarterlyRate: true,
          frequencyCode: 9,
          frequency: "Quarterly",
          sourceUnitCode: 81,
          sourceUnit: "Dollars",
          scalarFactorCode: 6,
          scalarFactor: "millions",
          decimals: Number(point.decimals ?? series.decimals),
          originalReferencePeriod: point.refPer,
          originalReferencePeriodRaw: point.refPerRaw ?? null,
          releaseTime: point.releaseTime ?? null,
          symbolCode: point.symbolCode ?? null,
          statusCode: point.statusCode ?? null,
          securityLevelCode: point.securityLevelCode ?? null,
          requestUrl: sourceUrl,
          retrievedAt: retrievedAt.toISOString(),
        },
      }),
    );
  }
  return [...observations.values()].sort(
    (left, right) => left.periodStart.getTime() - right.periodStart.getTime(),
  );
}
