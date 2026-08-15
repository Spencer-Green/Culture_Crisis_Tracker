import { describe, expect, it } from "vitest";

import {
  buildOperationalFreshness,
  summarizeFreshness,
} from "@/services/scheduler/freshness-core";
import {
  deriveFreshnessStatus,
  evaluateScheduledSource,
} from "@/services/scheduler/scheduler-core";
import type {
  ScheduledSourceDefinition,
  SchedulerRuntimeSource,
} from "@/services/scheduler/types";

const definition: ScheduledSourceDefinition = {
  sourceId: "rss",
  schedulingClass: "HIGH_FREQUENCY",
  cadenceMinutes: 180,
  automatic: true,
  networkKind: "networked",
  publicationFrequency: "continuous",
  requestIntensity: "low",
  routineScope: "24 hours",
  commands: () => [],
};

function source(success: string): SchedulerRuntimeSource {
  return {
    id: "0fda5de2-52ef-4aa8-91fe-b930daf577fd",
    slug: "rss",
    enabled: true,
    configured: true,
    implemented: true,
    lastAttemptedSyncAt: new Date(success),
    lastSuccessfulSyncAt: new Date(success),
  };
}

describe("scheduler freshness", () => {
  it.each([
    ["2026-08-16T04:00:00Z", "CURRENT"],
    ["2026-08-16T02:30:00Z", "DUE_SOON"],
    ["2026-08-16T01:00:00Z", "STALE"],
    ["2026-08-15T22:00:00Z", "OVERDUE"],
  ])("derives %s refresh recency as %s", (success, expected) => {
    expect(
      deriveFreshnessStatus({
        definition,
        source: source(success),
        state: null,
        now: new Date("2026-08-16T05:00:00Z"),
      }),
    ).toBe(expected);
  });

  it("keeps latest observation age distinct from ingestion freshness", () => {
    const evaluation = evaluateScheduledSource({
      definition,
      source: source("2026-08-16T04:00:00Z"),
      state: null,
      now: new Date("2026-08-16T05:00:00Z"),
    });
    const result = buildOperationalFreshness({
      evaluation,
      latestObservation: {
        period: "2026-06",
        observedAt: "2026-06-30T00:00:00.000Z",
      },
      latestIngestionRun: {
        status: "succeeded",
        startedAt: new Date("2026-08-16T04:00:00Z"),
        completedAt: new Date("2026-08-16T04:01:00Z"),
        recordsCreated: 2,
        recordsUpdated: 3,
      },
    });
    expect(result.status).toBe("CURRENT");
    expect(result.latestObservationPeriod).toBe("2026-06");
    expect(result.lastSuccessAt).toBe("2026-08-16T04:01:00.000Z");
    expect(result.lastCreatedCount).toBe(2);
  });

  it("summarizes current, structural, blocked, and failed states", () => {
    const base = {
      sourceId: "rss",
      schedulingClass: "HIGH_FREQUENCY",
      cadenceMinutes: 180,
      enabled: true,
      running: false,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      nextScheduledAt: null,
      latestObservationPeriod: null,
      latestObservationAt: null,
      lastRunStatus: "never",
      lastCreatedCount: 0,
      lastUpdatedCount: 0,
      consecutiveFailures: 0,
      action: "wait",
    } as const;
    const summary = summarizeFreshness([
      { ...base, status: "CURRENT" },
      { ...base, status: "STRUCTURAL" },
      { ...base, status: "BLOCKED" },
      { ...base, status: "FAILED_RECENTLY" },
    ]);
    expect(summary).toMatchObject({
      CURRENT: 1,
      STRUCTURAL: 1,
      BLOCKED: 1,
      FAILED_RECENTLY: 1,
    });
  });
});
