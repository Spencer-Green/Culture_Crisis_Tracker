import { unzipSync } from "fflate";
import * as XLSX from "xlsx";

import {
  BEA_ACPSA_CATEGORY,
  BEA_ACPSA_EMPLOYMENT_SHEET,
  BEA_ACPSA_OUTPUT_SHEET,
  BEA_ACPSA_SOURCE_STATUS,
  type BEAACPSAInspection,
  type BEAACPSASoundRecordingRecord,
} from "@/data-sources/music/bea-acpsa-types";

export class BEAACPSAParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BEAACPSAParseError";
  }
}

type Cell = string | number | boolean | Date | null | undefined;
type Rows = Cell[][];

function text(value: Cell) {
  return String(value ?? "").trim();
}

function numeric(value: Cell, field: string) {
  const cleaned = text(value).replaceAll(",", "");
  if (!cleaned || cleaned === "--" || cleaned === "…" || cleaned === "(D)")
    return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed))
    throw new BEAACPSAParseError(`BEA ACPSA ${field} is not numeric.`);
  return parsed;
}

function scale(value: Cell, multiplier: number, field: string) {
  const parsed = numeric(value, field);
  if (parsed === null) return null;
  const scaled = parsed * multiplier;
  if (!Number.isSafeInteger(scaled))
    throw new BEAACPSAParseError(
      `BEA ACPSA ${field} cannot be represented exactly.`,
    );
  return scaled;
}

function rowsFor(workbook: XLSX.WorkBook, sheetName: string): Rows {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet)
    throw new BEAACPSAParseError(`BEA ACPSA workbook is missing ${sheetName}.`);
  return XLSX.utils.sheet_to_json<Cell[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });
}

function exactRow(rows: Rows, label: string, sheetName: string) {
  const matches = rows.filter((row) => text(row[0]) === label);
  if (matches.length !== 1)
    throw new BEAACPSAParseError(
      `Expected one exact ${label} row in ${sheetName}; found ${matches.length}.`,
    );
  return matches[0];
}

function headerIndex(rows: Rows, label: string, sheetName: string) {
  const header = rows.find((row) => row.some((cell) => text(cell) === label));
  const index = header?.findIndex((cell) => text(cell) === label) ?? -1;
  if (index < 0)
    throw new BEAACPSAParseError(
      `BEA ACPSA ${sheetName} is missing the ${label} column.`,
    );
  return index;
}

export function parseBEAACPSAWorkbook(
  bytes: Uint8Array,
  input: { year: number; fileName: string; archiveUrl: string },
): BEAACPSASoundRecordingRecord {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, { cellDates: true });
  } catch {
    throw new BEAACPSAParseError("BEA ACPSA workbook could not be read.");
  }
  const outputRows = rowsFor(workbook, BEA_ACPSA_OUTPUT_SHEET);
  const employmentRows = rowsFor(workbook, BEA_ACPSA_EMPLOYMENT_SHEET);
  if (!text(outputRows[0]?.[0]).endsWith(`, ${input.year}`))
    throw new BEAACPSAParseError(
      "BEA ACPSA output table year does not match its workbook filename.",
    );
  if (text(outputRows[1]?.[0]) !== "[Millions of dollars]")
    throw new BEAACPSAParseError(
      "BEA ACPSA output/value-added unit was not millions of dollars.",
    );
  const outputRow = exactRow(
    outputRows,
    BEA_ACPSA_CATEGORY,
    BEA_ACPSA_OUTPUT_SHEET,
  );
  const employmentRow = exactRow(
    employmentRows,
    BEA_ACPSA_CATEGORY,
    BEA_ACPSA_EMPLOYMENT_SHEET,
  );
  const outputColumn = headerIndex(
    outputRows,
    "ACPSA Output",
    BEA_ACPSA_OUTPUT_SHEET,
  );
  const valueAddedColumn = headerIndex(
    outputRows,
    "ACPSA Value Added",
    BEA_ACPSA_OUTPUT_SHEET,
  );
  const employmentColumn = headerIndex(
    employmentRows,
    "ACPSA employment (thousands of employees)",
    BEA_ACPSA_EMPLOYMENT_SHEET,
  );
  const compensationColumn = headerIndex(
    employmentRows,
    "ACPSA compensation (millions of dollars)",
    BEA_ACPSA_EMPLOYMENT_SHEET,
  );
  return {
    year: input.year,
    categoryLabel: BEA_ACPSA_CATEGORY,
    acpsaOutputUsd:
      scale(outputRow[outputColumn], 1_000_000, "output")?.toString() ?? null,
    acpsaValueAddedUsd:
      scale(
        valueAddedColumn >= 0 ? outputRow[valueAddedColumn] : null,
        1_000_000,
        "value added",
      )?.toString() ?? null,
    acpsaEmployment: scale(
      employmentRow[employmentColumn],
      1_000,
      "employment",
    ),
    acpsaEmployeeCompensationUsd:
      scale(
        employmentRow[compensationColumn],
        1_000_000,
        "employee compensation",
      )?.toString() ?? null,
    sourceArchiveUrl: input.archiveUrl,
    sourceWorkbook: input.fileName,
    sourceTables: [BEA_ACPSA_OUTPUT_SHEET, BEA_ACPSA_EMPLOYMENT_SHEET],
    unitMetadata: {
      output: "millions of current dollars; normalized to USD",
      valueAdded: "millions of current dollars; normalized to USD",
      employment: "thousands of employees; normalized to employees",
      employeeCompensation: "millions of current dollars; normalized to USD",
      valuation: "current-dollar nominal",
    },
    rowsRead: outputRows.length + employmentRows.length,
  };
}

export function parseBEAACPSANationalArchive(
  bytes: Uint8Array,
  archiveUrl: string,
): BEAACPSAInspection {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new BEAACPSAParseError(
      "BEA ACPSA national download is not a valid ZIP archive.",
    );
  }
  const archiveFiles = Object.keys(files).sort();
  const annualFiles = archiveFiles
    .map((fileName) => ({
      fileName,
      match: fileName.match(/^ACPSA_(\d{4})\.xlsx$/),
    }))
    .filter(
      (value): value is { fileName: string; match: RegExpMatchArray } =>
        value.match !== null,
    )
    .sort((left, right) => Number(left.match[1]) - Number(right.match[1]));
  if (annualFiles.length === 0)
    throw new BEAACPSAParseError(
      "BEA ACPSA archive contains no annual national workbooks.",
    );
  const records = annualFiles.map(({ fileName, match }) =>
    parseBEAACPSAWorkbook(files[fileName], {
      year: Number(match[1]),
      fileName,
      archiveUrl,
    }),
  );
  const expectedYears = Array.from(
    { length: BEA_ACPSA_SOURCE_STATUS.latestOfficialYear - 1998 + 1 },
    (_, index) => 1998 + index,
  );
  const years = new Set(records.map((record) => record.year));
  if (records.some((record) => record.year > 2023))
    throw new BEAACPSAParseError(
      "BEA ACPSA archive unexpectedly contained a post-2023 annual workbook.",
    );
  return {
    archiveUrl,
    archiveFiles,
    annualWorkbookCount: annualFiles.length,
    ignoredStructuredFiles: archiveFiles.filter(
      (fileName) => !/^ACPSA_\d{4}\.xlsx$/.test(fileName),
    ),
    records,
    missingYears: expectedYears.filter((year) => !years.has(year)),
    worksheets: [BEA_ACPSA_OUTPUT_SHEET, BEA_ACPSA_EMPLOYMENT_SHEET],
    sourceStatus: BEA_ACPSA_SOURCE_STATUS,
    rowsRead: records.reduce((sum, record) => sum + record.rowsRead, 0),
  };
}
