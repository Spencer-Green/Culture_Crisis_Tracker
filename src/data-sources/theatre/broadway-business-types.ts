export const BROADWAY_BUSINESS_SOURCE_PAGE =
  "https://broadwaybusiness.com/grosses/";
export const BROADWAY_BUSINESS_ACCESS_CLASSIFICATION = "AUTHORIZED_STRUCTURED";
export const BROADWAY_BUSINESS_UNDERLYING_SOURCE = "The Broadway League";

export type BroadwayMarketWeekRecord = {
  sourceWeekId: number;
  seasonWeekNumber: number;
  weekStart: Date;
  weekEnding: Date;
  grossUsd: number;
  attendance: number;
  showCount: number | null;
  capacityPct: number | null;
  averageTicketPriceUsd: number | null;
  performanceCount: number | null;
  previewCount: number | null;
  metadata: Record<string, unknown>;
};

export type BroadwayBusinessDataset = {
  records: BroadwayMarketWeekRecord[];
  requestCount: number;
  latestPageWeek: BroadwayMarketWeekRecord;
  safeSourceUrl: string;
  safeChartUrl: string;
  rateLimit: { limit: number | null; remaining: number | null };
};
