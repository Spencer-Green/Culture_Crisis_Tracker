import { describe, expect, it } from "vitest";

import {
  screenAustraliaNextScheduledAt,
  screenAustraliaReportAge,
} from "@/services/film/screen-australia-core";

describe("Screen Australia report freshness", () => {
  it("distinguishes a stale source report from a recent retrieval", () => {
    expect(
      screenAustraliaReportAge(
        new Date("2026-03-25T00:00:00Z"),
        new Date("2026-08-24T00:00:00Z"),
      ),
    ).toEqual({ ageDays: 152, stale: true });
    expect(
      screenAustraliaReportAge(
        new Date("2026-08-20T00:00:00Z"),
        new Date("2026-08-24T00:00:00Z"),
      ),
    ).toEqual({ ageDays: 4, stale: false });
  });

  it("derives the next weekly check when scheduler state is not initialized", () => {
    expect(
      screenAustraliaNextScheduledAt(
        new Date("2026-08-24T00:00:00Z"),
        null,
      )?.toISOString(),
    ).toBe("2026-08-31T00:00:00.000Z");
    expect(
      screenAustraliaNextScheduledAt(
        new Date("2026-08-24T00:00:00Z"),
        new Date("2026-09-01T12:00:00Z"),
      )?.toISOString(),
    ).toBe("2026-09-01T12:00:00.000Z");
  });
});
