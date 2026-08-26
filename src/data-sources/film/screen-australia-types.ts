export const SCREEN_AUSTRALIA_WIDGET_URL =
  "https://box-office-widget.twistedpear-wgp.workers.dev";

export const SCREEN_AUSTRALIA_PERIOD_TYPES = [
  "WEEKLY_TOP_5",
  "AUSTRALIAN_YTD",
  "MONTHLY_TOP_20",
  "OVERALL_YTD_TOP_50",
] as const;

export type ScreenAustraliaPeriodType =
  (typeof SCREEN_AUSTRALIA_PERIOD_TYPES)[number];

export type ScreenAustraliaBoxOfficeRecord = {
  reportDate: Date;
  periodType: ScreenAustraliaPeriodType;
  rank: number;
  title: string;
  normalizedTitle: string;
  periodGrossAud: number | null;
  cumulativeGrossAud: number | null;
  releaseWeeks: string | null;
};

export type ScreenAustraliaParsedWidget = {
  records: ScreenAustraliaBoxOfficeRecord[];
  views: {
    periodType: ScreenAustraliaPeriodType;
    label: string;
    reportDate: Date;
    rowCount: number;
  }[];
  rowsRead: number;
  rowsSkipped: number;
  warnings: string[];
};
