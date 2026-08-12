import { describe, expect, it } from "vitest";

import {
  buildGdeltQuery,
  GDELT_QUERY_FAMILIES,
  getGdeltQueryFamily,
} from "@/data-sources/news/gdelt-queries";

describe("GDELT query taxonomy", () => {
  it("defines the intended negative and positive query families", () => {
    expect(GDELT_QUERY_FAMILIES.map((family) => family.id)).toEqual([
      "venue-closure",
      "festival-cancellation",
      "insolvency-bankruptcy",
      "layoffs",
      "funding-cuts",
      "demand-weakness",
      "positive-signals",
    ]);
    expect(getGdeltQueryFamily("venue-closure")?.query).toContain(
      '"music venue"',
    );
    expect(getGdeltQueryFamily("festival-cancellation")?.query).toContain(
      "cancelled",
    );
    expect(getGdeltQueryFamily("insolvency-bankruptcy")?.query).toContain(
      "receivership",
    );
    expect(getGdeltQueryFamily("layoffs")?.query).toContain("redundancies");
    expect(getGdeltQueryFamily("funding-cuts")?.query).toContain('"grant cut"');
    expect(getGdeltQueryFamily("demand-weakness")?.query).toContain(
      '"ticket sales"',
    );
    expect(getGdeltQueryFamily("positive-signals")?.query).toContain(
      "investment",
    );
  });

  it("applies either the four-market scope or one explicit country filter", () => {
    const family = GDELT_QUERY_FAMILIES[0];
    expect(buildGdeltQuery(family)).toContain("sourcecountry:australia OR");
    expect(buildGdeltQuery(family)).toContain("sourcecountry:unitedstates");
    expect(buildGdeltQuery(family, "GB")).toMatch(
      /sourcecountry:unitedkingdom$/,
    );
    expect(buildGdeltQuery(family, "GB")).not.toContain("sourcecountry:canada");
  });

  it("keeps phrase and boolean operators inspectable", () => {
    for (const family of GDELT_QUERY_FAMILIES) {
      expect(family.query).toContain("(");
      expect(family.query).toMatch(/ OR /);
    }
  });
});
