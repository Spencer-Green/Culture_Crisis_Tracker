import { describe, expect, it } from "vitest";

import type { LPAPerformanceYearRecord } from "@/data-sources/theatre/lpa-types";
import {
  classifyLPAUpserts,
  lpaRecordIdentity,
} from "@/services/theatre/lpa-ingestion-core";

const record: LPAPerformanceYearRecord = {
  year: 2024,
  category: "THEATRE",
  categoryLabel: "Theatre",
  geographyScope: "NATIONAL",
  revenueAud: 105_446_000,
  attendance: 1_386_000,
  averageTicketPriceAud: 83.86,
  sourceReportTitle: "LPA report",
  sourceReportUrl: "https://reports.liveperformance.com.au/report",
  sourceBundleUrl: "https://reports.liveperformance.com.au/app.js",
  sourcePublishedAt: new Date("2025-09-01T00:00:00Z"),
};

describe("LPA ingestion identity", () => {
  it("uses source year, category, and geography for deterministic upserts", () => {
    expect(lpaRecordIdentity(record)).toBe("2024:THEATRE:NATIONAL");
    expect(classifyLPAUpserts([record], new Set())).toEqual({
      created: 1,
      updated: 0,
    });
    expect(
      classifyLPAUpserts([record], new Set([lpaRecordIdentity(record)])),
    ).toEqual({ created: 0, updated: 1 });
  });
});
