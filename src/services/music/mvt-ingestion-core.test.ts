import { describe, expect, it } from "vitest";

import { MVT_REPORTS } from "@/data-sources/music/mvt-reports";
import { classifyMVTUpserts } from "@/services/music/mvt-ingestion-core";

describe("MVT ingestion idempotency", () => {
  it("creates unseen report years and updates existing years", () => {
    expect(classifyMVTUpserts(MVT_REPORTS, new Set([2023]))).toEqual({
      created: 2,
      updated: 1,
    });
  });

  it("treats an exact repeat as updates with zero creates", () => {
    expect(
      classifyMVTUpserts(MVT_REPORTS, new Set([2023, 2024, 2025])),
    ).toEqual({ created: 0, updated: 3 });
  });
});
