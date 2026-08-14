export const CENSUS_RECORD_NAICS = "512250";
export const CENSUS_RECORD_LABEL = "Record production and distribution";
export const CENSUS_AIES_TABLES = ["AIES00BASIC", "AIES00EXP01"] as const;

export type CensusAiesTable = (typeof CENSUS_AIES_TABLES)[number];

export type CensusAiesVintage = {
  year: number;
  vintage: string;
};

export const CENSUS_AIES_VINTAGES: readonly CensusAiesVintage[] = [
  { year: 2023, vintage: "2023" },
];

export type CensusRecordIndustryRecord = {
  year: number;
  naicsCode: string;
  industryLabel: string;
  revenueUsd: string | null;
  payrollUsd: string | null;
  employment: number | null;
  operatingExpensesUsd: string | null;
  revenueFlag: string | null;
  payrollFlag: string | null;
  employmentFlag: string | null;
  operatingExpensesFlag: string | null;
  revenueCvPct: number | null;
  payrollCvPct: number | null;
  employmentCvPct: number | null;
  operatingExpensesCvPct: number | null;
  sourceTable: string;
  sourceVintage: string;
  sourceUrls: string[];
  sourceRowsRead: number;
  employerScope: string;
};

export type CensusAiesInspection = {
  records: CensusRecordIndustryRecord[];
  files: Array<{
    year: number;
    table: CensusAiesTable;
    url: string;
    rowsRead: number;
    matchingRows: number;
  }>;
};
