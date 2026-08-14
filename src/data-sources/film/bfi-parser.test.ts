import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  BFIParseError,
  canonicaliseBFIWeekends,
  parseBFIStructuralWorkbooks,
  parseBFIWeekendWorkbook,
} from "@/data-sources/film/bfi-parser";
import type { BFIDownload } from "@/data-sources/film/bfi-types";

function workbookBytes(
  sheets: Record<string, (string | number | null)[][]>,
  bookType: "xls" | "xlsx" | "ods",
) {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets))
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  return XLSX.write(workbook, { type: "buffer", bookType });
}

function download(format: BFIDownload["format"]): BFIDownload {
  return {
    name: "Weekend box office report: 7 to 9 August 2026",
    url: `https://core-cms.bfi.org.uk/media/1/download`,
    fileName: `report.${format}`,
    format,
    mimeType: "application/octet-stream",
    publishedAt: new Date("2026-08-11T00:00:00Z"),
  };
}

function weeklyRows() {
  return [
    ["BFI Weekend Box Office 07/08/2026 - 09/08/2026"],
    ["Rank", "Film", "Country of Origin", "Weekend Gross", "Distributor"],
    [1, "Film One", "UK", "£100", "A"],
    [2, "Film Two", "US", "£50", "B"],
    [3, "Film Three", "US", "£25", "C"],
    [null, "Total", null, "£175"],
    [null, "Other UK films"],
    [20, "UK Film", "UK", "£10", "D"],
    [null, "Other new releases"],
    [21, "New Film", "FR", "£5", "E"],
    [null, "Comments on this week's top 15 results"],
  ];
}

describe.each(["xls", "xlsx", "ods"] as const)("BFI %s parsing", (format) => {
  it("preserves explicit top-15 and broader reported coverage", () => {
    const record = parseBFIWeekendWorkbook(
      workbookBytes({ Report: weeklyRows() }, format),
      download(format),
    );
    expect(record.weekendStart.toISOString()).toBe("2026-08-07T00:00:00.000Z");
    expect(record.weekendEnd.toISOString()).toBe("2026-08-09T00:00:00.000Z");
    expect(record.top15GrossGbp).toBe(175);
    expect(record.top15TotalSourcePublished).toBe(true);
    expect(record.reportedGrossGbp).toBe(190);
    expect(record.releaseCount).toBe(5);
    expect(record.topFilm).toBe("Film One");
    expect(record.top3GrossGbp).toBe(175);
  });
});

describe("BFI structural parsing", () => {
  it("supports the early-2019 title layout and column offset", () => {
    const rows = weeklyRows();
    rows[0] = [
      null,
      "BFI: Weekend 31st May-2nd June 2019 UK box office report",
    ];
    const record = parseBFIWeekendWorkbook(
      workbookBytes({ Report: rows }, "xls"),
      download("xls"),
    );
    expect(record.weekendStart.toISOString()).toBe("2019-05-31T00:00:00.000Z");
    expect(record.weekendEnd.toISOString()).toBe("2019-06-02T00:00:00.000Z");
  });

  it("derives the top-15 total when a legacy formula has no cached value", () => {
    const rows = weeklyRows();
    rows[5]![3] = null;
    const record = parseBFIWeekendWorkbook(
      workbookBytes({ Report: rows }, "xls"),
      download("xls"),
    );
    expect(record.top15GrossGbp).toBe(175);
    expect(record.top15TotalSourcePublished).toBe(false);
  });

  it("keeps the latest revision for a deterministic weekend identity", () => {
    const original = parseBFIWeekendWorkbook(
      workbookBytes({ Report: weeklyRows() }, "xls"),
      { ...download("xls"), publishedAt: new Date("2026-08-10T00:00:00Z") },
    );
    const revised = {
      ...original,
      reportedGrossGbp: 200,
      sourcePublishedAt: new Date("2026-08-11T00:00:00Z"),
    };
    const input = [revised, original];
    expect(canonicaliseBFIWeekends(input)).toEqual([revised]);
    expect(input).toEqual([revised, original]);
  });

  it("keeps film and HETV production distinct", () => {
    const boxOffice = workbookBytes(
      {
        F1: [
          ["Year", "Admissions (million)"],
          [2019, 176.1],
          [2023, 123.6],
        ],
        T4: [
          ["Year", "Box office gross (£ million)"],
          [2019, 1254],
          [2023, 980],
        ],
        F4: [
          ["Year", "Gross", "Number of releases"],
          [2019, 1300.9, 764],
          [2023, 994.3, 900],
        ],
      },
      "ods",
    );
    const production = workbookBytes(
      {
        F1: [
          [null, 2019, 2023],
          ["UK spend film (£ million)", 2173.7, 1356.9],
          ["UK spend HETV (£ million)", 2472.7, 2874.7],
          ["Number of film productions", 399, 207],
          ["Number of HETV productions", 169, 187],
        ],
      },
      "ods",
    );
    const records = parseBFIStructuralWorkbooks({
      boxOfficeBytes: boxOffice,
      productionBytes: production,
      boxOfficeUrl: "https://core-cms.bfi.org.uk/media/1/download",
      productionUrl: "https://core-cms.bfi.org.uk/media/2/download",
    });
    expect(records.at(-1)).toMatchObject({
      year: 2023,
      cinemaAdmissionsMillions: 123.6,
      ukBoxOfficeGrossGbpM: 980,
      releaseCount: 900,
      filmProductionSpendGbpM: 1356.9,
      filmProductionCount: 207,
      hetvProductionSpendGbpM: 2874.7,
      hetvProductionCount: 187,
    });
  });

  it("rejects malformed workbooks", () => {
    expect(() =>
      parseBFIWeekendWorkbook(new Uint8Array([1, 2, 3]), download("xls")),
    ).toThrow(BFIParseError);
  });
});
