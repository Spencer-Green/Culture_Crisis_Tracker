import { describe, expect, it } from "vitest";

import type { BEAACPSASoundRecordingRecord } from "@/data-sources/music/bea-acpsa-types";
import { classifyBEAACPSAUpserts } from "@/services/music/bea-acpsa-ingestion-core";

describe("BEA ACPSA annual identity", () => {
  it("treats a repeated year as a revision update", () => {
    const records = [{ year: 2023 }] as BEAACPSASoundRecordingRecord[];
    expect(classifyBEAACPSAUpserts(records, new Set())).toEqual({
      created: 1,
      updated: 0,
    });
    expect(classifyBEAACPSAUpserts(records, new Set([2023]))).toEqual({
      created: 0,
      updated: 1,
    });
  });
});
