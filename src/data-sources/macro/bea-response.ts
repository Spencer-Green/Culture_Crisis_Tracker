import type { BeaMetricDefinition } from "@/data-sources/macro/bea-metrics";
import { parseBeaApiMonth } from "@/data-sources/macro/bea-period";
import {
  normalisedObservationSchema,
  type NormalisedObservation,
} from "@/data-sources/types";
import { BeaResponseError } from "@/data-sources/macro/bea-api";

type BeaDataRow = {
  TableName: string;
  SeriesCode: string;
  LineNumber: string;
  LineDescription: string;
  TimePeriod: string;
  METRIC_NAME: string;
  CL_UNIT: string;
  UNIT_MULT: string;
  DataValue: string;
  NoteRef?: string;
};

function getResults(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    throw new BeaResponseError("BEA returned an invalid response.");
  }
  const beaApi = (payload as { BEAAPI?: unknown }).BEAAPI;
  const results =
    beaApi && typeof beaApi === "object"
      ? (beaApi as { Results?: unknown }).Results
      : undefined;
  if (!results || typeof results !== "object") {
    throw new BeaResponseError("BEA returned an invalid response.");
  }
  return results as Record<string, unknown>;
}

function parseRow(value: unknown): BeaDataRow {
  if (!value || typeof value !== "object") {
    throw new BeaResponseError("BEA returned an invalid data row.");
  }
  const row = value as Partial<BeaDataRow>;
  const required = [
    "TableName",
    "SeriesCode",
    "LineNumber",
    "LineDescription",
    "TimePeriod",
    "METRIC_NAME",
    "CL_UNIT",
    "UNIT_MULT",
    "DataValue",
  ] as const;
  if (required.some((key) => typeof row[key] !== "string")) {
    throw new BeaResponseError("BEA returned an invalid data row.");
  }
  return row as BeaDataRow;
}

function parseDataValue(value: string): string | null {
  const compact = value.replaceAll(",", "").trim();
  if (!compact || /^(?:--|\(NA\)|NA|N\/A)$/i.test(compact)) return null;
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(compact)) {
    throw new BeaResponseError("BEA returned a non-numeric observation.");
  }
  return compact;
}

export function parseBeaObservations(
  payload: unknown,
  metric: BeaMetricDefinition,
  requestUrl: string,
  retrievedAt: Date,
  startDate: Date,
  endDate: Date,
): NormalisedObservation[] {
  const results = getResults(payload);
  if (!Array.isArray(results.Data)) {
    throw new BeaResponseError("BEA returned no observation data.");
  }
  const observations = new Map<string, NormalisedObservation>();

  for (const value of results.Data) {
    const row = parseRow(value);
    if (
      row.TableName !== metric.tableName ||
      row.LineNumber !== metric.lineNumber
    ) {
      continue;
    }
    if (
      row.LineDescription.trim() !== metric.lineDescription ||
      row.SeriesCode !== metric.seriesCode ||
      row.METRIC_NAME !== metric.metricName ||
      row.UNIT_MULT !== metric.unitMultiplier
    ) {
      throw new BeaResponseError("BEA metric metadata no longer matches.");
    }
    const period = parseBeaApiMonth(row.TimePeriod);
    if (period.periodStart < startDate || period.periodStart > endDate)
      continue;
    const dataValue = parseDataValue(row.DataValue);
    if (dataValue === null) continue;

    observations.set(
      period.periodStart.toISOString(),
      normalisedObservationSchema.parse({
        metricSlug: metric.slug,
        countryCode: metric.countryCode,
        sectorSlug: metric.sectorSlug,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        value: dataValue,
        sourceUrl: requestUrl,
        retrievedAt,
        metadata: {
          dataset: metric.dataset,
          tableName: metric.tableName,
          tableTitle: metric.tableTitle,
          lineNumber: metric.lineNumber,
          lineDescription: metric.lineDescription,
          frequency: metric.frequency,
          unit: metric.unit,
          unitMultiplier: metric.unitMultiplier,
          adjustment: metric.adjustment,
          priceBasis: metric.priceBasis,
          seriesCode: row.SeriesCode,
          metricName: row.METRIC_NAME,
          levelUnit: row.CL_UNIT,
          originalPeriod: row.TimePeriod,
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
