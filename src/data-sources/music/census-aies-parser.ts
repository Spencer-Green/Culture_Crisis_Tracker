import { parse } from "csv-parse/sync";
import { strFromU8, unzipSync } from "fflate";

import {
  CENSUS_RECORD_LABEL,
  CENSUS_RECORD_NAICS,
  type CensusAiesTable,
  type CensusRecordIndustryRecord,
} from "@/data-sources/music/census-aies-types";

export class CensusAiesParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CensusAiesParseError";
  }
}

type CensusRow = Record<string, string>;

function normaliseHeader(header: string) {
  return header.replace(/^#/, "").trim();
}

export function parseCensusAiesArchive(
  bytes: Uint8Array,
  table: CensusAiesTable,
): { rows: CensusRow[]; rowsRead: number } {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new CensusAiesParseError("Census AIES archive is not a valid ZIP.");
  }
  const expectedName = `${table}.DAT`;
  const entry = Object.entries(files).find(
    ([name]) => name.split("/").at(-1)?.toUpperCase() === expectedName,
  );
  if (!entry)
    throw new CensusAiesParseError(
      `Census AIES archive does not contain ${expectedName}.`,
    );
  let rows: CensusRow[];
  try {
    rows = parse(strFromU8(entry[1]), {
      bom: true,
      columns: (headers: string[]) => headers.map(normaliseHeader),
      delimiter: "|",
      skip_empty_lines: true,
      trim: true,
    }) as CensusRow[];
  } catch {
    throw new CensusAiesParseError(
      `Census AIES ${table} pipe-delimited data is malformed.`,
    );
  }
  if (rows.length === 0)
    throw new CensusAiesParseError(`Census AIES ${table} contains no rows.`);
  return { rows, rowsRead: rows.length };
}

function flag(value: string | undefined) {
  const result = value?.trim();
  return result ? result : null;
}

function decimal(value: string | undefined, field: string) {
  const cleaned = value?.trim().replaceAll(",", "");
  if (!cleaned) return null;
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned))
    throw new CensusAiesParseError(
      `Census AIES ${field} is not a valid numeric value.`,
    );
  return Number(cleaned);
}

function thousandsToUsd(value: string | undefined, field: string) {
  const numeric = decimal(value, field);
  if (numeric === null) return null;
  if (!Number.isSafeInteger(numeric))
    throw new CensusAiesParseError(
      `Census AIES ${field} cannot be represented exactly.`,
    );
  return (BigInt(numeric) * BigInt(1_000)).toString();
}

function integer(value: string | undefined, field: string) {
  const numeric = decimal(value, field);
  if (numeric === null) return null;
  if (!Number.isSafeInteger(numeric))
    throw new CensusAiesParseError(`Census AIES ${field} is not an integer.`);
  return numeric;
}

function selectRecordRow(rows: readonly CensusRow[], table: CensusAiesTable) {
  const matches = rows.filter(
    (row) =>
      row.GEOTYPE === "01" &&
      row.ST === "00" &&
      row.GEO_ID === "0100000US" &&
      row.NAICS === CENSUS_RECORD_NAICS &&
      row.TYPOP === "00" &&
      row.TAXSTAT === "00",
  );
  if (matches.length !== 1)
    throw new CensusAiesParseError(
      `Expected one national ${CENSUS_RECORD_NAICS} row in ${table}; found ${matches.length}.`,
    );
  if (matches[0].NAICS_LABEL !== CENSUS_RECORD_LABEL)
    throw new CensusAiesParseError(
      `Census AIES ${CENSUS_RECORD_NAICS} label did not match the validated industry.`,
    );
  return matches[0];
}

export function buildCensusRecordIndustryRecord(input: {
  basicRows: readonly CensusRow[];
  expenseRows: readonly CensusRow[];
  basicRowsRead: number;
  expenseRowsRead: number;
  basicUrl: string;
  expenseUrl: string;
  vintage: string;
}): CensusRecordIndustryRecord {
  const basic = selectRecordRow(input.basicRows, "AIES00BASIC");
  const expense = selectRecordRow(input.expenseRows, "AIES00EXP01");
  if (basic.YEAR !== expense.YEAR || basic.YEAR !== input.vintage)
    throw new CensusAiesParseError(
      "Census AIES basic and expense rows use different vintages.",
    );
  const basicRevenue = thousandsToUsd(basic.RCPT_TOT_VAL, "revenue");
  const expenseRevenue = thousandsToUsd(expense.RCPT_TOT_VAL, "revenue");
  if (basicRevenue !== expenseRevenue)
    throw new CensusAiesParseError(
      "Census AIES revenue differs between the joined official tables.",
    );
  return {
    year: Number(basic.YEAR),
    naicsCode: basic.NAICS,
    industryLabel: basic.NAICS_LABEL,
    revenueUsd: basicRevenue,
    payrollUsd: thousandsToUsd(basic.PAY_ANN_VAL, "annual payroll"),
    employment: integer(basic.EMP_MAR12_NUM, "employment"),
    operatingExpensesUsd: thousandsToUsd(
      expense.EXPS_TOT_DVAL,
      "operating expenses",
    ),
    revenueFlag: flag(basic.RCPT_TOT_VAL_F),
    payrollFlag: flag(basic.PAY_ANN_VAL_F),
    employmentFlag: flag(basic.EMP_MAR12_NUM_F),
    operatingExpensesFlag: flag(expense.EXPS_TOT_DVAL_F),
    revenueCvPct: decimal(basic.RCPT_TOT_CV, "revenue CV"),
    payrollCvPct: decimal(basic.PAY_ANN_CV, "payroll CV"),
    employmentCvPct: decimal(basic.EMP_MAR12_CV, "employment CV"),
    operatingExpensesCvPct: decimal(
      expense.EXPS_TOT_CV,
      "operating-expense CV",
    ),
    sourceTable: "AIES00BASIC+AIES00EXP01",
    sourceVintage: input.vintage,
    sourceUrls: [input.basicUrl, input.expenseUrl],
    sourceRowsRead: input.basicRowsRead + input.expenseRowsRead,
    employerScope: "Employer firms; all establishments",
  };
}
