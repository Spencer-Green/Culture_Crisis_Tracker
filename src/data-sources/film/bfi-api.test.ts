import { describe, expect, it } from "vitest";

import {
  BFIResponseError,
  buildBFIWeeklyIndexUrl,
  parseBFIDownloads,
  validateBFIDownloadUrl,
} from "@/data-sources/film/bfi-api";

const page = `<!doctype html><script>var initialPageState = ${JSON.stringify({
  data: [
    {
      attributes: {
        name: "Weekend box office report: 7 to 9 August 2026",
        downloadPath: "https://core-cms.bfi.org.uk/media/45138/download",
        fileName: "bfi-weekend-box-office-report-2026-08-07-09.ods",
        mimeType: "application/vnd.oasis.opendocument.spreadsheet",
        changed: "2026-08-11T15:55:47+00:00",
      },
    },
  ],
})};</script>`;

describe("BFI discovery", () => {
  it("extracts official structured download metadata", () => {
    expect(parseBFIDownloads(page)).toEqual([
      expect.objectContaining({
        format: "ods",
        fileName: "bfi-weekend-box-office-report-2026-08-07-09.ods",
        url: "https://core-cms.bfi.org.uk/media/45138/download",
      }),
    ]);
  });

  it("constructs bounded official yearly index URLs", () => {
    expect(
      buildBFIWeeklyIndexUrl(
        "https://www.bfi.org.uk/industry-data-insights/weekend-box-office-figures",
        2019,
      ),
    ).toContain("uk-weekend-box-office-reports-2019");
  });

  it("rejects non-BFI download hosts", () => {
    expect(() =>
      validateBFIDownloadUrl("https://example.com/report.xls"),
    ).toThrow(BFIResponseError);
  });
});
