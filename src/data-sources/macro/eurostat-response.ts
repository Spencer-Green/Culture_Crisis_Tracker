import {
  getJsonStatCategory,
  getJsonStatCell,
  parseJsonStatDataset,
  EurostatResponseError,
} from "@/data-sources/macro/eurostat-jsonstat";
import type { EurostatMetricDefinition } from "@/data-sources/macro/eurostat-metrics";
import { getEurostatYearBoundaries } from "@/data-sources/macro/eurostat-period";
import {
  normalisedObservationSchema,
  type NormalisedObservation,
} from "@/data-sources/types";

function decimalString(value: number): string {
  const direct = String(value);
  if (!/[eE]/.test(direct)) return direct;
  return value.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
}

export function parseEurostatObservations(
  payload: unknown,
  metric: EurostatMetricDefinition,
  requestUrl: string,
  retrievedAt: Date,
  startYear: string,
  endYear: string,
): NormalisedObservation[] {
  const dataset = parseJsonStatDataset(payload);
  const requiredDimensions = ["freq", "unit", "coicop18", "geo", "time"];
  if (
    dataset.ids.length !== requiredDimensions.length ||
    !requiredDimensions.every((id) => dataset.ids.includes(id))
  ) {
    throw new EurostatResponseError(
      "Eurostat response dimensions do not match nama_10_cp18.",
    );
  }
  const frequency = getJsonStatCategory(dataset, "freq", "A");
  const unit = getJsonStatCategory(dataset, "unit", metric.unitCode);
  const purpose = getJsonStatCategory(dataset, "coicop18", metric.coicopCode);
  const geography = getJsonStatCategory(dataset, "geo", metric.geographyCode);
  if (
    frequency.label !== "Annual" ||
    unit.label !== metric.unitLabel ||
    purpose.label !== metric.coicopLabel ||
    geography.label !== metric.geographyLabel
  ) {
    throw new EurostatResponseError(
      "Eurostat response metadata no longer matches the metric mapping.",
    );
  }

  const observations = new Map<string, NormalisedObservation>();
  for (const time of dataset.dimensions.time.categories) {
    if (
      !/^\d{4}$/.test(time.code) ||
      time.code < startYear ||
      time.code > endYear
    ) {
      continue;
    }
    const cell = getJsonStatCell(dataset, {
      freq: "A",
      unit: metric.unitCode,
      coicop18: metric.coicopCode,
      geo: metric.geographyCode,
      time: time.code,
    });
    if (cell.value === null) continue;
    const period = getEurostatYearBoundaries(time.code);
    observations.set(
      period.periodStart.toISOString(),
      normalisedObservationSchema.parse({
        metricSlug: metric.slug,
        countryCode: metric.countryCode,
        sectorSlug: metric.sectorSlug,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        value: decimalString(cell.value),
        sourceUrl: requestUrl,
        retrievedAt,
        metadata: {
          datasetCode: metric.datasetCode,
          datasetTitle: dataset.label,
          dimensionOrder: dataset.ids,
          frequencyCode: frequency.code,
          frequencyLabel: frequency.label,
          unitCode: unit.code,
          unitLabel: unit.label,
          priceBasis: metric.priceBasis,
          geographyCode: geography.code,
          geographyLabel: geography.label,
          coicopCode: purpose.code,
          coicopLabel: purpose.label,
          classification: metric.classification,
          originalPeriod: time.code,
          observationStatus: cell.status,
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
