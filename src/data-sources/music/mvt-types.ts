export type MVTUnprofitabilityDefinition =
  "reported-loss" | "reported-no-profit";

export type MVTGrassrootsYearRecord = {
  year: number;
  venueCount: number | null;
  permanentClosures: number | null;
  venuesNoLongerOperating: number | null;
  venuesUnprofitablePct: number | null;
  unprofitabilityDefinition: MVTUnprofitabilityDefinition | null;
  averageProfitMarginPct: number | null;
  eventCount: number | null;
  ticketedLiveMusicEvents: number | null;
  audienceVisits: number | null;
  totalSectorRevenueGbp: number | null;
  liveMusicIncomeGbp: number | null;
  employment: number | null;
  jobsLost: number | null;
  townsWithoutRegularTouring: number | null;
  sourceReportUrl: string;
  sourceReleaseUrl: string;
  sourcePublishedAt: Date | null;
  notes: readonly string[];
};

export type MVTReportInspection = {
  year: number;
  url: string;
  reachable: boolean;
  httpStatus: number;
  contentType: string | null;
  contentLength: number | null;
  fields: string[];
};
