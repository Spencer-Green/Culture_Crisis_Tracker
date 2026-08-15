export const LPA_ACCESS_CLASSIFICATION = "PUBLIC_STATIC_REPORT" as const;
export const LPA_GEOGRAPHY_SCOPE = "NATIONAL" as const;

export const LPA_CATEGORIES = [
  { code: "THEATRE", label: "Theatre" },
  { code: "MUSICAL_THEATRE", label: "Musical Theatre" },
] as const;

export type LPACategory = (typeof LPA_CATEGORIES)[number]["code"];

export type LPAArchiveReport = {
  reportYear: number;
  title: string;
  reportUrl: string;
  publishedAt: Date | null;
};

export type LPAPerformanceYearRecord = {
  year: number;
  category: LPACategory;
  categoryLabel: string;
  geographyScope: typeof LPA_GEOGRAPHY_SCOPE;
  revenueAud: number | null;
  attendance: number | null;
  averageTicketPriceAud: number | null;
  sourceReportTitle: string;
  sourceReportUrl: string;
  sourceBundleUrl: string;
  sourcePublishedAt: Date | null;
};

export type LPAInspection = {
  accessClassification: typeof LPA_ACCESS_CLASSIFICATION;
  archiveUrl: string;
  report: LPAArchiveReport;
  bundleUrl: string;
  requestCount: number;
  records: LPAPerformanceYearRecord[];
  categories: { code: LPACategory; label: string }[];
  earliestYear: number;
  latestYear: number;
  missingYears: number[];
  units: {
    revenue: string;
    attendance: string;
    averageTicketPrice: string;
  };
  comparabilityNotes: string[];
  latencyMs: number;
};
