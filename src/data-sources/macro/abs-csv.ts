import { parse } from "csv-parse/sync";
import { z } from "zod";

import type { AbsMetricDefinition } from "@/data-sources/macro/abs-metrics";
import {
  getAbsMonthBoundaries,
  getAbsQuarterBoundaries,
} from "@/data-sources/macro/abs-period";
import {
  normalisedObservationSchema,
  type NormalisedObservation,
} from "@/data-sources/types";

const csvRecordsSchema = z.array(z.record(z.string(), z.string()));
const numericValuePattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

export type AbsCsvParseResult = {
  observations: NormalisedObservation[];
  rowsRead: number;
  rowsSkipped: number;
};

type CodeAndLabel = {
  code: string;
  label: string;
};

function getColumn(
  row: Readonly<Record<string, string>>,
  id: string,
): string | undefined {
  if (row[id] !== undefined) {
    return row[id];
  }

  const key = Object.keys(row).find((column) => column.startsWith(`${id}:`));
  return key ? row[key] : undefined;
}

function parseCodeAndLabel(value: string | undefined): CodeAndLabel | null {
  if (!value?.trim()) {
    return null;
  }

  const separator = value.indexOf(": ");
  if (separator === -1) {
    return { code: value.trim(), label: value.trim() };
  }

  return {
    code: value.slice(0, separator).trim(),
    label: value.slice(separator + 2).trim(),
  };
}

function normaliseDecimal(value: string): string | null {
  const trimmed = value.trim();
  if (!numericValuePattern.test(trimmed)) {
    return null;
  }

  let normalised = trimmed.startsWith("+") ? trimmed.slice(1) : trimmed;
  normalised = normalised.replace(/^(-?)\./, "$10.");
  normalised = normalised.endsWith(".") ? `${normalised}0` : normalised;
  return normalised;
}

function requireExpectedCode(
  row: Readonly<Record<string, string>>,
  column: string,
  expected: CodeAndLabel,
): CodeAndLabel {
  const actual = parseCodeAndLabel(getColumn(row, column));
  if (!actual || actual.code !== expected.code) {
    throw new Error(
      `ABS response contained an unexpected ${column} code for the requested metric.`,
    );
  }

  return actual;
}

export function parseAbsObservationCsv(
  body: string,
  metric: AbsMetricDefinition,
  sourceUrl: string,
  retrievedAt: Date,
): AbsCsvParseResult {
  let rawRecords: unknown;

  try {
    rawRecords = parse(body, {
      bom: true,
      columns: true,
      skip_empty_lines: true,
      relax_column_count: false,
    });
  } catch {
    throw new Error("ABS observation response was not valid CSV.");
  }

  const parsedRecords = csvRecordsSchema.safeParse(rawRecords);
  if (!parsedRecords.success) {
    throw new Error("ABS observation CSV did not match the expected schema.");
  }

  const observationsByPeriod = new Map<string, NormalisedObservation>();
  let rowsSkipped = 0;

  for (const row of parsedRecords.data) {
    const period = getColumn(row, "TIME_PERIOD")?.trim();
    const originalValue = getColumn(row, "OBS_VALUE") ?? "";
    const value = normaliseDecimal(originalValue);

    if (!period || !value) {
      rowsSkipped += 1;
      continue;
    }

    const measure = requireExpectedCode(
      row,
      "MEASURE",
      metric.dimensions.measure,
    );
    const category = requireExpectedCode(
      row,
      "CATEGORY",
      metric.dimensions.category,
    );
    const priceAdjustment = requireExpectedCode(
      row,
      "PRICE_ADJUSTMENT",
      metric.dimensions.priceAdjustment,
    );
    const adjustmentType = requireExpectedCode(
      row,
      "TSEST",
      metric.dimensions.adjustmentType,
    );
    const geography = requireExpectedCode(
      row,
      "STATE",
      metric.dimensions.geography,
    );
    const frequency = requireExpectedCode(
      row,
      "FREQ",
      metric.dimensions.frequency,
    );
    const unit = requireExpectedCode(row, "UNIT_MEASURE", {
      code: metric.unitMetadata.code,
      label: metric.unitMetadata.label,
    });
    const multiplier = requireExpectedCode(row, "UNIT_MULT", {
      code: metric.unitMetadata.multiplierCode,
      label: metric.unitMetadata.multiplierLabel,
    });
    const { periodStart, periodEnd } =
      metric.frequency === "quarterly"
        ? getAbsQuarterBoundaries(period)
        : getAbsMonthBoundaries(period);
    const observationStatus = parseCodeAndLabel(getColumn(row, "OBS_STATUS"));
    const observationComment = getColumn(row, "OBS_COMMENT")?.trim() || null;

    const observation = normalisedObservationSchema.parse({
      metricSlug: metric.slug,
      countryCode: metric.countryCode,
      sectorSlug: metric.sectorSlug,
      periodStart,
      periodEnd,
      value,
      sourceUrl,
      retrievedAt,
      metadata: {
        provider: "Australian Bureau of Statistics",
        dataflow: {
          agency: metric.dataflow.agency,
          id: metric.dataflow.id,
          version: metric.dataflow.version,
        },
        seriesKey: [
          metric.dataflow.agency,
          metric.dataflow.id,
          metric.dataflow.version,
          [
            metric.dimensions.measure.code,
            metric.dimensions.category.code,
            metric.dimensions.priceAdjustment.code,
            metric.dimensions.adjustmentType.code,
            metric.dimensions.geography.code,
            metric.dimensions.frequency.code,
          ].join("."),
        ].join("/"),
        priceBasis: priceAdjustment.label,
        chainVolumeMeasure: priceAdjustment.code === "CVM",
        dimensions: {
          measure,
          category,
          priceAdjustment,
          adjustmentType,
          geography,
          frequency,
        },
        unit,
        multiplier,
        originalObservationValue: originalValue,
        observationStatus,
        observationComment,
        sourceRequestUrl: sourceUrl,
        retrievedAt: retrievedAt.toISOString(),
      },
    });

    observationsByPeriod.set(period, observation);
  }

  return {
    observations: [...observationsByPeriod.values()].sort(
      (left, right) => left.periodStart.getTime() - right.periodStart.getTime(),
    ),
    rowsRead: parsedRecords.data.length,
    rowsSkipped,
  };
}
