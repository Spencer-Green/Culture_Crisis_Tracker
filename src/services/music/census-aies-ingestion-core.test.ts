import { describe, expect, it } from "vitest";

import type { CensusRecordIndustryRecord } from "@/data-sources/music/census-aies-types";
import { classifyCensusAiesUpserts } from "@/services/music/census-aies-ingestion-core";

const record = {
  year: 2023,
  naicsCode: "512250",
  sourceVintage: "2023",
} as CensusRecordIndustryRecord;

describe("Census AIES ingestion identity", () => {
  it("classifies first insert and idempotent revision updates", () => {
    expect(classifyCensusAiesUpserts([record], new Set())).toEqual({
      created: 1,
      updated: 0,
    });
    expect(
      classifyCensusAiesUpserts([record], new Set(["2023:512250:2023"])),
    ).toEqual({ created: 0, updated: 1 });
  });
});
