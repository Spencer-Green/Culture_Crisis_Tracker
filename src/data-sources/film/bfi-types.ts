export const BFI_WEEKLY_PAGE =
  "https://www.bfi.org.uk/industry-data-insights/weekend-box-office-figures";
export const BFI_YEARBOOK_PAGE =
  "https://www.bfi.org.uk/industry-data-insights/statistical-yearbook";

export type BFIDownload = {
  name: string;
  url: string;
  fileName: string;
  format: "ods" | "xlsx" | "xls";
  mimeType: string;
  publishedAt: Date | null;
};

export type BFIWeekendRecord = {
  weekendStart: Date;
  weekendEnd: Date;
  sourceDateLabel: string;
  reportedGrossGbp: number;
  top15GrossGbp: number;
  top15TotalSourcePublished: boolean;
  releaseCount: number;
  topFilm: string | null;
  topFilmGrossGbp: number | null;
  top3GrossGbp: number | null;
  top5GrossGbp: number | null;
  top10GrossGbp: number | null;
  sourceFileUrl: string;
  sourceFileName: string;
  sourceFormat: string;
  sourcePublishedAt: Date | null;
};

export type BFIFilmMarketYearRecord = {
  year: number;
  cinemaAdmissionsMillions: number | null;
  ukBoxOfficeGrossGbpM: number | null;
  releaseCount: number | null;
  filmProductionSpendGbpM: number | null;
  filmProductionCount: number | null;
  hetvProductionSpendGbpM: number | null;
  hetvProductionCount: number | null;
  sourceBoxOfficeUrl: string | null;
  sourceProductionUrl: string | null;
  sourceYearbook: string;
};
