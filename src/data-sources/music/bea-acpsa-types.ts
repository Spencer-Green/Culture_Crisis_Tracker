export const BEA_ACPSA_NATIONAL_ARCHIVE_URL =
  "https://apps.bea.gov/regional/zip/acpsanational.zip";
export const BEA_ACPSA_CATEGORY = "Sound Recording";
export const BEA_ACPSA_OUTPUT_SHEET = "Table2_Industry_Output_VA";
export const BEA_ACPSA_EMPLOYMENT_SHEET = "Table4_Employment";
export const BEA_ACPSA_SOURCE_STATUS = {
  role: "structural-historical",
  latestOfficialYear: 2023,
  regularlyProduced: false,
  discontinuationNote: "BEA will no longer regularly produce these statistics.",
} as const;

export type BEAACPSASoundRecordingRecord = {
  year: number;
  categoryLabel: typeof BEA_ACPSA_CATEGORY;
  acpsaOutputUsd: string | null;
  acpsaValueAddedUsd: string | null;
  acpsaEmployment: number | null;
  acpsaEmployeeCompensationUsd: string | null;
  sourceArchiveUrl: string;
  sourceWorkbook: string;
  sourceTables: string[];
  unitMetadata: {
    output: string;
    valueAdded: string;
    employment: string;
    employeeCompensation: string;
    valuation: "current-dollar nominal";
  };
  rowsRead: number;
};

export type BEAACPSAInspection = {
  archiveUrl: string;
  archiveFiles: string[];
  annualWorkbookCount: number;
  ignoredStructuredFiles: string[];
  records: BEAACPSASoundRecordingRecord[];
  missingYears: number[];
  worksheets: string[];
  sourceStatus: typeof BEA_ACPSA_SOURCE_STATUS;
  rowsRead: number;
};
