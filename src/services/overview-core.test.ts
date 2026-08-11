import { describe, expect, it } from "vitest";

import { buildOverviewState } from "@/services/overview-core";

describe("overview state", () => {
  it("derives successful ingestion and observation freshness by source", async () => {
    const state = await buildOverviewState(async () => [
      {
        slug: "abs",
        name: "ABS",
        lastSuccessfulSyncAt: new Date("2026-08-11T01:00:00.000Z"),
        ingestionRuns: [{ completedAt: new Date("2026-08-11T01:05:00.000Z") }],
        metricDefinitions: [
          {
            observations: [
              {
                periodStart: new Date("2026-06-01T00:00:00.000Z"),
                periodEnd: new Date("2026-06-30T00:00:00.000Z"),
              },
            ],
          },
          {
            observations: [
              {
                periodStart: new Date("2026-07-01T00:00:00.000Z"),
                periodEnd: new Date("2026-07-31T00:00:00.000Z"),
              },
            ],
          },
        ],
      },
      {
        slug: "ons",
        name: "ONS",
        lastSuccessfulSyncAt: new Date("2026-08-10T01:00:00.000Z"),
        ingestionRuns: [{ completedAt: null }],
        metricDefinitions: [
          {
            observations: [
              {
                periodStart: new Date("2026-01-01T00:00:00.000Z"),
                periodEnd: new Date("2026-03-31T23:59:59.999Z"),
              },
            ],
          },
        ],
      },
    ]);

    expect(state).toMatchObject({
      databaseStatus: "available",
      successfulSourceCount: 2,
      contributingSourceCount: 2,
      latestSuccessfulIngestionAt: "2026-08-11T01:05:00.000Z",
    });
    expect(state.sourceFreshness[0]).toEqual({
      slug: "abs",
      name: "ABS",
      latestObservationPeriod: {
        start: "2026-07-01T00:00:00.000Z",
        end: "2026-07-31T00:00:00.000Z",
      },
      lastSuccessfulIngestionAt: "2026-08-11T01:05:00.000Z",
    });
  });

  it("returns a confirmed empty state when no successful runs exist", async () => {
    const state = await buildOverviewState(async () => []);

    expect(state).toEqual({
      databaseStatus: "available",
      successfulSourceCount: 0,
      contributingSourceCount: 0,
      latestSuccessfulIngestionAt: null,
      sourceFreshness: [],
    });
  });

  it("degrades without exposing database errors", async () => {
    const state = await buildOverviewState(async () => {
      throw new Error("sensitive database failure");
    });

    expect(state).toEqual({
      databaseStatus: "unavailable",
      successfulSourceCount: 0,
      contributingSourceCount: 0,
      latestSuccessfulIngestionAt: null,
      sourceFreshness: [],
    });
    expect(JSON.stringify(state)).not.toContain("sensitive database failure");
  });
});
