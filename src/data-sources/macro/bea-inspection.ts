import {
  buildBeaDataUrl,
  buildBeaUrl,
  fetchBeaJson,
  type BeaRequestOptions,
} from "@/data-sources/macro/bea-api";
import {
  BEA_METRICS,
  type BeaMetricDefinition,
} from "@/data-sources/macro/bea-metrics";

export type BeaInspectionOptions = BeaRequestOptions & {
  metrics?: readonly BeaMetricDefinition[];
};

export type BeaMetricInspection = {
  dataset: string;
  tableName: string;
  tableTitle: string;
  lineNumber: string;
  lineDescription: string;
  seriesCode: string;
  frequency: string;
  unit: string;
  adjustment: string;
  firstAvailablePeriod: string;
  latestAvailablePeriod: string;
  firstValue: string;
  latestValue: string;
};

type BeaYearRecord = {
  TableName: string;
  FirstMonthlyYear: string;
  LastMonthlyYear: string;
};

function getResults(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    throw new Error("BEA metadata response was invalid.");
  }
  const beaApi = (payload as { BEAAPI?: unknown }).BEAAPI;
  const results =
    beaApi && typeof beaApi === "object"
      ? (beaApi as { Results?: unknown }).Results
      : undefined;
  if (!results || typeof results !== "object") {
    throw new Error("BEA metadata response was invalid.");
  }
  return results as Record<string, unknown>;
}

function parseYearRecords(payload: unknown): BeaYearRecord[] {
  const values = getResults(payload).ParamValue;
  if (!Array.isArray(values)) {
    throw new Error("BEA year metadata response was invalid.");
  }
  return values.filter(
    (value): value is BeaYearRecord =>
      Boolean(value) &&
      typeof value === "object" &&
      typeof (value as BeaYearRecord).TableName === "string" &&
      typeof (value as BeaYearRecord).FirstMonthlyYear === "string" &&
      typeof (value as BeaYearRecord).LastMonthlyYear === "string",
  );
}

function parseDataRows(payload: unknown): Record<string, string>[] {
  const data = getResults(payload).Data;
  if (!Array.isArray(data)) {
    throw new Error("BEA table data response was invalid.");
  }
  return data.filter(
    (value): value is Record<string, string> =>
      Boolean(value) && typeof value === "object",
  ) as Record<string, string>[];
}

export async function inspectBeaMetrics(
  baseUrl: string,
  apiKey: string,
  options: BeaInspectionOptions = {},
): Promise<BeaMetricInspection[]> {
  const metrics = options.metrics ?? BEA_METRICS;
  const yearsByDataset = new Map<string, BeaYearRecord[]>();
  for (const dataset of new Set(metrics.map((metric) => metric.dataset))) {
    const yearUrl = buildBeaUrl(baseUrl, apiKey, {
      method: "GetParameterValues",
      DatasetName: dataset,
      ParameterName: "Year",
    });
    yearsByDataset.set(
      dataset,
      parseYearRecords((await fetchBeaJson(yearUrl, options)).payload),
    );
  }
  const rowsByTable = new Map<string, Record<string, string>[]>();

  for (const metric of metrics) {
    const tableKey = `${metric.dataset}:${metric.tableName}`;
    if (rowsByTable.has(tableKey)) continue;
    const availability = (yearsByDataset.get(metric.dataset) ?? []).find(
      (item) => item.TableName === metric.tableName,
    );
    if (!availability) {
      throw new Error("BEA table availability metadata was incomplete.");
    }
    const requestedYears = [
      availability.FirstMonthlyYear,
      ...metrics
        .filter(
          (candidate) =>
            candidate.dataset === metric.dataset &&
            candidate.tableName === metric.tableName,
        )
        .map((candidate) => candidate.firstAvailablePeriod.slice(0, 4)),
      availability.LastMonthlyYear,
    ];
    const url = buildBeaDataUrl(
      baseUrl,
      apiKey,
      metric.dataset,
      metric.tableName,
      [...new Set(requestedYears)],
    );
    rowsByTable.set(
      tableKey,
      parseDataRows((await fetchBeaJson(url, options)).payload),
    );
  }

  return metrics.map((metric) => {
    const rows = (
      rowsByTable.get(`${metric.dataset}:${metric.tableName}`) ?? []
    )
      .filter(
        (row) =>
          row.LineNumber === metric.lineNumber &&
          row.SeriesCode === metric.seriesCode,
      )
      .sort((left, right) => left.TimePeriod.localeCompare(right.TimePeriod));
    if (rows.length === 0) {
      throw new Error("BEA metric line metadata was incomplete.");
    }
    const toMonth = (period: string) =>
      `${period.slice(0, 4)}-${period.slice(5, 7)}`;
    return {
      dataset: metric.dataset,
      tableName: metric.tableName,
      tableTitle: metric.tableTitle,
      lineNumber: metric.lineNumber,
      lineDescription: metric.lineDescription,
      seriesCode: metric.seriesCode,
      frequency: metric.frequency,
      unit: metric.unit,
      adjustment: metric.adjustment,
      firstAvailablePeriod: toMonth(rows[0].TimePeriod),
      latestAvailablePeriod: toMonth(rows.at(-1)!.TimePeriod),
      firstValue: rows[0].DataValue,
      latestValue: rows.at(-1)!.DataValue,
    };
  });
}

export function getCommonBeaAvailability(
  inspections: readonly BeaMetricInspection[],
) {
  if (inspections.length === 0) {
    throw new Error("No BEA metrics are available.");
  }
  return {
    earliestPeriod: inspections.reduce(
      (latest, metric) =>
        metric.firstAvailablePeriod > latest
          ? metric.firstAvailablePeriod
          : latest,
      inspections[0].firstAvailablePeriod,
    ),
    latestPeriod: inspections.reduce(
      (earliest, metric) =>
        metric.latestAvailablePeriod < earliest
          ? metric.latestAvailablePeriod
          : earliest,
      inspections[0].latestAvailablePeriod,
    ),
  };
}

export function getFullBeaAvailability(
  inspections: readonly BeaMetricInspection[],
) {
  if (inspections.length === 0) {
    throw new Error("No BEA metrics are available.");
  }
  return {
    earliestPeriod: inspections.reduce(
      (earliest, metric) =>
        metric.firstAvailablePeriod < earliest
          ? metric.firstAvailablePeriod
          : earliest,
      inspections[0].firstAvailablePeriod,
    ),
    latestPeriod: inspections.reduce(
      (earliest, metric) =>
        metric.latestAvailablePeriod < earliest
          ? metric.latestAvailablePeriod
          : earliest,
      inspections[0].latestAvailablePeriod,
    ),
  };
}
