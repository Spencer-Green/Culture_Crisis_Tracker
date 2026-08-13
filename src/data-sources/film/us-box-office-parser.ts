import { strFromU8, unzipSync } from "fflate";

import type {
  ParsedUSBoxOfficeArchive,
  USBoxOfficeWeekendRecord,
} from "@/data-sources/film/us-box-office-types";

export class USBoxOfficeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "USBoxOfficeParseError";
  }
}

const EXPECTED_COLUMNS = [
  "date",
  "occasion",
  "top10_gross",
  "top10_wow_change",
  "overall_gross",
  "overall_wow_change",
  "num_releases",
  "top_release",
  "week_no",
] as const;

const MONTHS = new Map(
  [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ].map((month, index) => [month, index]),
);

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted)
    throw new USBoxOfficeParseError("Dataset CSV has an unterminated quote.");
  if (field || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  return rows;
}

function nullable(value: string): string | null {
  const clean = value.trim();
  return clean && clean !== "-" ? clean : null;
}

export function parseUsd(value: string): number | null {
  const clean = nullable(value);
  if (!clean) return null;
  if (!/^\$[\d,]+$/.test(clean))
    throw new USBoxOfficeParseError("Dataset contains an invalid USD gross.");
  const parsed = Number(clean.slice(1).replaceAll(",", ""));
  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw new USBoxOfficeParseError("Dataset contains an unsafe USD gross.");
  return parsed;
}

export function parsePercent(value: string): number | null {
  const clean = nullable(value);
  if (!clean) return null;
  if (/^<\d+(?:\.\d+)?%$/.test(clean)) return null;
  if (!/^[+-]?[\d,]+(?:\.\d+)?%$/.test(clean))
    throw new USBoxOfficeParseError("Dataset contains an invalid percentage.");
  return Number(clean.slice(0, -1).replaceAll(",", ""));
}

function parseInteger(value: string): number | null {
  const clean = nullable(value);
  if (!clean) return null;
  const parsed = Number(clean);
  if (!Number.isInteger(parsed) || parsed < 0)
    throw new USBoxOfficeParseError("Dataset contains an invalid integer.");
  return parsed;
}

export function parseWeekendLabel(
  label: string,
  sourceYear: number,
): { weekendStart: Date; weekendEnd: Date } {
  const match =
    /^([A-Z][a-z]{2}) (\d{1,2})-(?:([A-Z][a-z]{2}) )?(\d{1,2})(?:, (\d{4}))?$/.exec(
      label.trim(),
    );
  if (!match)
    throw new USBoxOfficeParseError(
      `Unsupported weekend date label "${label}".`,
    );
  const startMonth = MONTHS.get(match[1]);
  const endMonth = MONTHS.get(match[3] ?? match[1]);
  if (startMonth === undefined || endMonth === undefined)
    throw new USBoxOfficeParseError("Dataset contains an invalid month label.");
  const explicitEndYear = match[5] ? Number(match[5]) : null;
  const endYear =
    explicitEndYear ?? (endMonth < startMonth ? sourceYear + 1 : sourceYear);
  const startYear = endMonth < startMonth ? endYear - 1 : sourceYear;
  const weekendStart = new Date(
    Date.UTC(startYear, startMonth, Number(match[2])),
  );
  const weekendEnd = new Date(Date.UTC(endYear, endMonth, Number(match[4])));
  if (
    weekendStart.getUTCMonth() !== startMonth ||
    weekendEnd.getUTCMonth() !== endMonth ||
    weekendEnd < weekendStart
  )
    throw new USBoxOfficeParseError(
      "Dataset contains an invalid weekend date.",
    );
  return { weekendStart, weekendEnd };
}

function durationDays(record: USBoxOfficeWeekendRecord): number {
  return (
    Math.round(
      (record.weekendEnd.getTime() - record.weekendStart.getTime()) /
        86_400_000,
    ) + 1
  );
}

function chooseCanonical(
  records: USBoxOfficeWeekendRecord[],
): USBoxOfficeWeekendRecord {
  return [...records].sort((left, right) => {
    const duration =
      Math.abs(durationDays(left) - 3) - Math.abs(durationDays(right) - 3);
    if (duration !== 0) return duration;
    const occasion =
      Number(Boolean(left.occasion)) - Number(Boolean(right.occasion));
    if (occasion !== 0) return occasion;
    return right.totalGrossUsd - left.totalGrossUsd;
  })[0];
}

export function parseUSBoxOfficeArchive(
  archive: Uint8Array,
  options: { startYear?: number; throughDate?: Date } = {},
): ParsedUSBoxOfficeArchive {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(archive);
  } catch {
    throw new USBoxOfficeParseError(
      "Kaggle returned an invalid dataset archive.",
    );
  }
  const startYear = options.startYear ?? 2015;
  const throughDate = options.throughDate ?? new Date();
  const fileNames = Object.keys(files)
    .filter((name) => /^weekend_summary_\d{4}\.csv$/.test(name))
    .sort();
  if (fileNames.length === 0)
    throw new USBoxOfficeParseError(
      "Dataset archive contains no annual summary CSV files.",
    );
  const candidates = new Map<string, USBoxOfficeWeekendRecord[]>();
  const missingByField = Object.fromEntries(
    EXPECTED_COLUMNS.map((column) => [column, 0]),
  );
  let rawRows = 0;
  let futureRowsSkipped = 0;
  let nullGrossRowsSkipped = 0;
  for (const fileName of fileNames) {
    const sourceYear = Number(/(\d{4})/.exec(fileName)?.[1]);
    if (sourceYear < startYear) continue;
    const rows = parseCsv(strFromU8(files[fileName]));
    const header = rows.shift();
    if (!header || header.join(",") !== EXPECTED_COLUMNS.join(","))
      throw new USBoxOfficeParseError(`Unexpected columns in ${fileName}.`);
    for (const values of rows) {
      rawRows += 1;
      if (values.length !== EXPECTED_COLUMNS.length)
        throw new USBoxOfficeParseError(`Unexpected row width in ${fileName}.`);
      EXPECTED_COLUMNS.forEach((column, index) => {
        if (!nullable(values[index])) missingByField[column] += 1;
      });
      const totalGrossUsd = parseUsd(values[4]);
      if (totalGrossUsd === null) {
        nullGrossRowsSkipped += 1;
        continue;
      }
      const dates = parseWeekendLabel(values[0], sourceYear);
      if (dates.weekendEnd > throughDate) {
        futureRowsSkipped += 1;
        continue;
      }
      const weekNumber = parseInteger(values[8]);
      if (weekNumber === null || weekNumber < 1 || weekNumber > 53)
        throw new USBoxOfficeParseError(`Invalid week number in ${fileName}.`);
      const record: USBoxOfficeWeekendRecord = {
        sourceYear,
        weekNumber,
        ...dates,
        sourceDateLabel: values[0].trim(),
        occasion: nullable(values[1]),
        totalGrossUsd,
        top10GrossUsd: parseUsd(values[2]),
        top10WowChangePct: parsePercent(values[3]),
        top10WowChangeLabel: nullable(values[3]),
        overallWowChangePct: parsePercent(values[5]),
        overallWowChangeLabel: nullable(values[5]),
        releaseCount: parseInteger(values[6]),
        topFilm: nullable(values[7]),
        sourceFile: fileName,
      };
      const key = `${sourceYear}:${weekNumber}`;
      const group = candidates.get(key) ?? [];
      group.push(record);
      candidates.set(key, group);
    }
  }
  const records = [...candidates.values()]
    .map(chooseCanonical)
    .sort(
      (left, right) => left.weekendEnd.getTime() - right.weekendEnd.getTime(),
    );
  return {
    records,
    fileNames,
    columns: [...EXPECTED_COLUMNS],
    rawRows,
    missingByField,
    duplicateVariantsRemoved: [...candidates.values()].reduce(
      (count, group) => count + Math.max(group.length - 1, 0),
      0,
    ),
    futureRowsSkipped,
    nullGrossRowsSkipped,
  };
}
