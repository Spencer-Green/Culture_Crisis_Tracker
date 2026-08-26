import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ScreenAustraliaBoxOffice } from "@/components/screen-australia-box-office";

const view = {
  periodType: "WEEKLY_TOP_5" as const,
  reportDate: "2026-03-25T00:00:00.000Z",
  ageDays: 152,
  stale: true,
  retrievedAt: "2026-08-24T00:00:00.000Z",
  rows: [
    {
      rank: 1,
      title: "Project Hail Mary",
      periodGrossAud: 8_261_513,
      cumulativeGrossAud: 9_000_941,
      releaseWeeks: "1",
    },
  ],
};

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

describe("Screen Australia native Film section", () => {
  it("renders native current data, provenance, and stale-report warning", () => {
    const html = renderToStaticMarkup(
      <ScreenAustraliaBoxOffice
        views={[view]}
        databaseStatus="available"
        lastSuccessfulAt="2026-08-24T00:00:00.000Z"
        nextScheduledAt="2026-08-31T00:00:00.000Z"
        lastRunFailed={false}
      />,
    );
    expect(html).toContain("Australian Box Office — Current");
    expect(html).toContain("Project Hail Mary");
    expect(html).toContain("Source report warning");
    expect(html).toContain("Provisional private/research");
    expect(html).not.toContain("iframe");
    expect(html).not.toContain("Total Australian box office");
  });

  it("keeps existing US and BFI Film sections wired", () => {
    const page = readFileSync(
      join(process.cwd(), "src/app/film/page.tsx"),
      "utf8",
    );
    expect(page).toContain("US Domestic Box Office");
    expect(page).toContain("UK Weekend Box Office");
    expect(page).toContain("getBFIFilmData");
    expect(page).toContain("ScreenAustraliaBoxOffice");
    expect(page).not.toContain("ScreenAustraliaBoxOfficeWidget");
  });

  it("contains no Box Office Mojo, Numero, or browser-automation acquisition", () => {
    const roots = ["src/data-sources/film", "src/services/film", "scripts"];
    const acquisitionCode = roots
      .flatMap((root) => sourceFiles(join(process.cwd(), root)))
      .filter((path) => /screen-australia|screenaustralia/i.test(path))
      .filter((path) => !/\.test\.[^.]+$/.test(path))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(acquisitionCode).not.toMatch(
      /boxofficemojo|numero\.co|playwright|puppeteer|selenium/i,
    );
  });
});
