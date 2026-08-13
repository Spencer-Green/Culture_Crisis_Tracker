export const US_BOX_OFFICE_DATASET_SLUG =
  "jonbown/weekend-box-office-summaries";
export const US_BOX_OFFICE_DATASET_TITLE = "U.S. Weekend Box Office Summaries";
export const US_BOX_OFFICE_DATASET_PAGE =
  "https://www.kaggle.com/datasets/jonbown/weekend-box-office-summaries";
export const US_BOX_OFFICE_PROVENANCE = "Box Office Mojo-derived";

export type USBoxOfficeWeekendRecord = {
  sourceYear: number;
  weekNumber: number;
  weekendStart: Date;
  weekendEnd: Date;
  sourceDateLabel: string;
  occasion: string | null;
  totalGrossUsd: number;
  top10GrossUsd: number | null;
  overallWowChangePct: number | null;
  top10WowChangePct: number | null;
  overallWowChangeLabel: string | null;
  top10WowChangeLabel: string | null;
  releaseCount: number | null;
  topFilm: string | null;
  sourceFile: string;
};

export type ParsedUSBoxOfficeArchive = {
  records: USBoxOfficeWeekendRecord[];
  fileNames: string[];
  columns: string[];
  rawRows: number;
  missingByField: Record<string, number>;
  duplicateVariantsRemoved: number;
  futureRowsSkipped: number;
  nullGrossRowsSkipped: number;
};
