import { describe, expect, it } from "vitest";

import {
  parseLPAArchiveIndex,
  parseLPAReportBundle,
  parseLPAReportBundleUrl,
} from "@/data-sources/theatre/lpa-parser";

const archive = `
  <li id="ticket-survey-2023"><a href="ticket-survey-2023/index.html">
    Attendance and Revenue Report 2023 <span class="pub">Published Sep 2024</span>
  </a></li>
  <li id="ticket-survey-2024"><a href="ticket-survey-2024/index.html">
    Live Performance Attendance and Revenue Report 2024
    <span class="pub">Published Sep 2025</span>
  </a></li>`;

function category(
  label: "Theatre" | "Musical Theatre",
  revenue: string,
  attendance: string,
  prices: string,
) {
  return `${prices} Categories ${label} Final.pdf totalRevenueAttendance:{xAxis:[{categories:[2019,2023,2024]}],series:[{name:"Revenue",type:"column",data:[${revenue}]},{name:"Attendance",type:"column",yAxis:1,data:[${attendance}]}]}`;
}

const bundle = [
  category(
    "Theatre",
    "146.562,121.774,105.446",
    "1.531,1.438,1.386",
    "The average ticket price fell from $91.16 in 2023 to $83.86 in 2024.",
  ),
  category(
    "Musical Theatre",
    "337.338,542.172,531.588",
    "3.452,4.289,4.379",
    "The average ticket price moved from $131.10 in 2023 to $127.43 in 2024.",
  ),
].join(";");

describe("LPA public report parsing", () => {
  it("discovers annual reports and the single official bundle", () => {
    const reports = parseLPAArchiveIndex(
      archive,
      "https://reports.liveperformance.com.au/",
    );
    expect(reports).toHaveLength(2);
    expect(reports.at(-1)).toMatchObject({
      reportYear: 2024,
      title: "Live Performance Attendance and Revenue Report 2024",
      reportUrl:
        "https://reports.liveperformance.com.au/ticket-survey-2024/index.html",
      publishedAt: new Date("2025-09-01T00:00:00.000Z"),
    });
    expect(
      parseLPAReportBundleUrl(
        '<script src="js/app.abc123.js"></script>',
        reports.at(-1)!.reportUrl,
      ),
    ).toBe(
      "https://reports.liveperformance.com.au/ticket-survey-2024/js/app.abc123.js",
    );
  });

  it("keeps Theatre and Musical Theatre distinct and normalizes source units", () => {
    const report = parseLPAArchiveIndex(
      archive,
      "https://reports.liveperformance.com.au/",
    ).at(-1)!;
    const inspection = parseLPAReportBundle(bundle, {
      archiveUrl: "https://reports.liveperformance.com.au/",
      report,
      bundleUrl:
        "https://reports.liveperformance.com.au/ticket-survey-2024/js/app.abc123.js",
    });
    expect(inspection.records).toHaveLength(6);
    expect(inspection.categories.map((value) => value.code)).toEqual([
      "THEATRE",
      "MUSICAL_THEATRE",
    ]);
    expect(
      inspection.records.find(
        (value) => value.category === "THEATRE" && value.year === 2024,
      ),
    ).toMatchObject({
      revenueAud: 105_446_000,
      attendance: 1_386_000,
      averageTicketPriceAud: 83.86,
      geographyScope: "NATIONAL",
    });
    expect(
      inspection.records.find(
        (value) => value.category === "MUSICAL_THEATRE" && value.year === 2024,
      ),
    ).toMatchObject({
      revenueAud: 531_588_000,
      attendance: 4_379_000,
      averageTicketPriceAud: 127.43,
    });
    expect(inspection.missingYears).toEqual([2020, 2021, 2022]);
  });

  it("rejects malformed or incomplete static report data", () => {
    const report = parseLPAArchiveIndex(
      archive,
      "https://reports.liveperformance.com.au/",
    ).at(-1)!;
    expect(() =>
      parseLPAReportBundle(bundle.replace("105.446", ""), {
        archiveUrl: "https://reports.liveperformance.com.au/",
        report,
        bundleUrl:
          "https://reports.liveperformance.com.au/ticket-survey-2024/js/app.js",
      }),
    ).toThrow("missing value");
    expect(() => parseLPAArchiveIndex("<html />", report.reportUrl)).toThrow(
      "no annual reports",
    );
  });
});
