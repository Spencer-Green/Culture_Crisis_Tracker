import type { MVTGrassrootsYearRecord } from "@/data-sources/music/mvt-types";

export const MVT_REPORTS: readonly MVTGrassrootsYearRecord[] = [
  {
    year: 2023,
    venueCount: 835,
    permanentClosures: 76,
    venuesNoLongerOperating: 72,
    venuesUnprofitablePct: 38.5,
    unprofitabilityDefinition: "reported-loss",
    averageProfitMarginPct: 0.5,
    eventCount: 187_040,
    ticketedLiveMusicEvents: null,
    audienceVisits: 23_657_220,
    totalSectorRevenueGbp: 501_101_118,
    liveMusicIncomeGbp: 134_123_094,
    employment: 28_223,
    jobsLost: null,
    townsWithoutRegularTouring: null,
    sourceReportUrl:
      "https://www.musicvenuetrust.com/wp-content/uploads/2024/01/MVT_2023-Annual-Report_Digital.pdf",
    sourceReleaseUrl:
      "https://www.musicvenuetrust.com/2024/01/music-venue-trust-launch-annual-report-2/",
    sourcePublishedAt: new Date("2024-01-24T00:00:00.000Z"),
    notes: [
      "Detailed membership review reports 76 permanent closures and 72 venues no longer meeting GMV criteria.",
      "The release headline separately describes 125 spaces lost; these concepts are not silently merged.",
    ],
  },
  {
    year: 2024,
    venueCount: 810,
    permanentClosures: 46,
    venuesNoLongerOperating: 40,
    venuesUnprofitablePct: 43.8,
    unprofitabilityDefinition: "reported-loss",
    averageProfitMarginPct: 0.48,
    eventCount: 162_092,
    ticketedLiveMusicEvents: 91_149,
    audienceVisits: 19_410_840,
    totalSectorRevenueGbp: 525_570_734,
    liveMusicIncomeGbp: 113_634_865,
    employment: 30_865,
    jobsLost: null,
    townsWithoutRegularTouring: null,
    sourceReportUrl:
      "https://www.musicvenuetrust.com/wp-content/uploads/2025/01/MVT_2024-Annual-Report.pdf",
    sourceReleaseUrl:
      "https://www.musicvenuetrust.com/2025/01/music-venue-trust-launch-2024-annual-report/",
    sourcePublishedAt: new Date("2025-01-21T00:00:00.000Z"),
    notes: [
      "MVT reports 43.8% of venues made a loss and an average sector profit margin of 0.48%.",
    ],
  },
  {
    year: 2025,
    venueCount: 801,
    permanentClosures: 30,
    venuesNoLongerOperating: 48,
    venuesUnprofitablePct: 53.8,
    unprofitabilityDefinition: "reported-no-profit",
    averageProfitMarginPct: 2.5,
    eventCount: 174_552,
    ticketedLiveMusicEvents: 95_696,
    audienceVisits: 21_683_552,
    totalSectorRevenueGbp: 558_525_252,
    liveMusicIncomeGbp: 179_220_581,
    employment: 24_742,
    jobsLost: 6_123,
    townsWithoutRegularTouring: 175,
    sourceReportUrl:
      "https://www.musicvenuetrust.com/wp-content/uploads/2026/01/MVT_2025-Annual-Report_Digital-Spreads.pdf",
    sourceReleaseUrl:
      "https://www.musicvenuetrust.com/2026/01/music-venue-trust-annual-report-2025/",
    sourcePublishedAt: new Date("2026-01-21T00:00:00.000Z"),
    notes: [
      "Jobs lost is the exact change from 30,865 reported employment in 2024 to 24,742 in 2025.",
      "The 2025 report uses no-profit rather than loss terminology, so direct unprofitability YoY is guarded.",
    ],
  },
] as const;

export function getMVTReports(year?: number) {
  return year === undefined
    ? [...MVT_REPORTS]
    : MVT_REPORTS.filter((report) => report.year === year);
}
