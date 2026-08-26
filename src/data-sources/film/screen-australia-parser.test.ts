import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  normalizeScreenAustraliaTitle,
  parseScreenAustraliaAud,
  parseScreenAustraliaReportDate,
  parseScreenAustraliaWidgetHtml,
  ScreenAustraliaParseError,
} from "@/data-sources/film/screen-australia-parser";

const fixture = readFileSync(
  fileURLToPath(
    new URL("./__fixtures__/screen-australia-widget.html", import.meta.url),
  ),
  "utf8",
);

describe("Screen Australia widget parser", () => {
  it("parses all four exact public widget views", () => {
    const parsed = parseScreenAustraliaWidgetHtml(fixture);

    expect(parsed.views.map((view) => view.periodType)).toEqual([
      "WEEKLY_TOP_5",
      "AUSTRALIAN_YTD",
      "MONTHLY_TOP_20",
      "OVERALL_YTD_TOP_50",
    ]);
    expect(parsed.views.map((view) => view.rowCount)).toEqual([2, 2, 2, 2]);
    expect(parsed.rowsRead).toBe(8);
    expect(parsed.rowsSkipped).toBe(0);
  });

  it("parses report dates, AUD values, release periods, and entities", () => {
    const parsed = parseScreenAustraliaWidgetHtml(fixture);
    expect(parsed.records[0]).toMatchObject({
      reportDate: new Date("2026-03-25T00:00:00.000Z"),
      periodType: "WEEKLY_TOP_5",
      rank: 1,
      title: "Project Hail Mary",
      periodGrossAud: 8_261_513,
      cumulativeGrossAud: 9_000_941,
      releaseWeeks: "1",
    });
    expect(
      parsed.records.find((record) => record.title.includes("Avatar")),
    ).toMatchObject({
      title: "Avatar: Fire & Ash",
      normalizedTitle: "avatar fire and ash",
      releaseWeeks: null,
    });
  });

  it("keeps missing optional values null", () => {
    const parsed = parseScreenAustraliaWidgetHtml(fixture);
    expect(
      parsed.records.find((record) => record.title === "The Pout-Pout Fish"),
    ).toMatchObject({ periodGrossAud: null, cumulativeGrossAud: 1_731_421 });
  });

  it("parses exact currency/date helpers and deterministic identities", () => {
    expect(parseScreenAustraliaAud("$1,234,567")).toBe(1_234_567);
    expect(parseScreenAustraliaAud("-")).toBeNull();
    expect(parseScreenAustraliaReportDate("5 Aug 2026").toISOString()).toBe(
      "2026-08-05T00:00:00.000Z",
    );
    expect(normalizeScreenAustraliaTitle("  Héllo & Goodbye! ")).toBe(
      "hello and goodbye",
    );
  });

  it("fails safely instead of parsing a changed table", () => {
    expect(() =>
      parseScreenAustraliaWidgetHtml(
        fixture.replace('data-tipid="weekly-tip"', 'data-tipid="unknown"'),
      ),
    ).toThrow(ScreenAustraliaParseError);
    expect(() =>
      parseScreenAustraliaWidgetHtml(
        fixture.replace("Top 20 Films: monthly", "Monthly films"),
      ),
    ).toThrow(/layout changed/i);
  });
});
