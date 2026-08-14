import { describe, expect, it } from "vitest";

import { SOURCE_DEFINITIONS } from "@/data-sources/catalog";
import { getMVTReports, MVT_REPORTS } from "@/data-sources/music/mvt-reports";

describe("MVT versioned official-report mappings", () => {
  it("preserves official 2023-2025 report identities and source semantics", () => {
    expect(MVT_REPORTS.map((report) => report.year)).toEqual([
      2023, 2024, 2025,
    ]);
    expect(
      MVT_REPORTS.every((report) =>
        report.sourceReportUrl.startsWith("https://www.musicvenuetrust.com/"),
      ),
    ).toBe(true);
    expect(MVT_REPORTS.at(-1)).toMatchObject({
      venueCount: 801,
      permanentClosures: 30,
      venuesUnprofitablePct: 53.8,
      averageProfitMarginPct: 2.5,
      eventCount: 174_552,
      employment: 24_742,
    });
  });

  it("keeps changed unprofitability definitions explicit", () => {
    expect(MVT_REPORTS[1].unprofitabilityDefinition).toBe("reported-loss");
    expect(MVT_REPORTS[2].unprofitabilityDefinition).toBe("reported-no-profit");
  });

  it("filters one report without inventing unavailable years", () => {
    expect(getMVTReports(2024)).toHaveLength(1);
    expect(getMVTReports(2022)).toEqual([]);
  });

  it("does not add prohibited RIAA automated source code", () => {
    expect(
      SOURCE_DEFINITIONS.some((source) => String(source.slug) === "riaa"),
    ).toBe(false);
  });
});
