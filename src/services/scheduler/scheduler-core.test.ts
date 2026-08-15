import { describe, expect, it } from "vitest";

import {
  calculateNextScheduledAt,
  evaluateScheduledSource,
  executeScheduledSource,
  lockCanBeAcquired,
  runWithConcurrency,
  selectScheduleEvaluations,
  type SchedulerExecutionStore,
} from "@/services/scheduler/scheduler-core";
import type {
  ScheduledSourceDefinition,
  SchedulerRuntimeSource,
  SchedulerStateRecord,
} from "@/services/scheduler/types";

const NOW = new Date("2026-08-16T00:00:00.000Z");

function definition(
  overrides: Partial<ScheduledSourceDefinition> = {},
): ScheduledSourceDefinition {
  return {
    sourceId: "abs",
    schedulingClass: "DAILY",
    cadenceMinutes: 1_440,
    automatic: true,
    networkKind: "networked",
    publicationFrequency: "monthly",
    requestIntensity: "low",
    routineScope: "recent",
    commands: () => [],
    ...overrides,
  };
}

function source(
  overrides: Partial<SchedulerRuntimeSource> = {},
): SchedulerRuntimeSource {
  return {
    id: "2fce9a3b-cabb-4b55-b4df-a08fe71f59ef",
    slug: "abs",
    enabled: true,
    configured: true,
    implemented: true,
    lastAttemptedSyncAt: null,
    lastSuccessfulSyncAt: new Date("2026-08-14T00:00:00.000Z"),
    ...overrides,
  };
}

function state(
  overrides: Partial<SchedulerStateRecord> = {},
): SchedulerStateRecord {
  return {
    sourceId: source().id,
    schedulingClass: "DAILY",
    cadenceMinutes: 1_440,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    nextScheduledAt: null,
    lastRunStatus: "never",
    lastRunId: null,
    lastCreatedCount: 0,
    lastUpdatedCount: 0,
    consecutiveFailures: 0,
    lastErrorMessage: null,
    activeRunId: null,
    lockAcquiredAt: null,
    lockExpiresAt: null,
    ...overrides,
  };
}

describe("central scheduler evaluation", () => {
  it("runs due sources and preserves recent sources across restart", () => {
    const due = evaluateScheduledSource({
      definition: definition(),
      source: source(),
      state: null,
      now: NOW,
    });
    expect(due.due).toBe(true);
    expect(due.nextScheduledAt?.toISOString()).toBe("2026-08-15T00:00:00.000Z");
    const recentSource = source({
      lastSuccessfulSyncAt: new Date("2026-08-15T12:00:00.000Z"),
    });
    expect(
      evaluateScheduledSource({
        definition: definition(),
        source: recentSource,
        state: null,
        now: NOW,
      }).due,
    ).toBe(false);
    expect(
      calculateNextScheduledAt({
        definition: definition(),
        source: recentSource,
        state: null,
        now: NOW,
      })?.toISOString(),
    ).toBe("2026-08-16T12:00:00.000Z");
  });

  it.each([
    ["disabled", definition(), source({ enabled: false }), "DISABLED"],
    [
      "structural",
      definition({
        schedulingClass: "STRUCTURAL_STATIC",
        cadenceMinutes: null,
        automatic: false,
      }),
      source(),
      "STRUCTURAL",
    ],
    [
      "blocked",
      definition({
        schedulingClass: "DISABLED_OR_BLOCKED",
        cadenceMinutes: null,
        automatic: false,
        blockedReason: "HTTP 429",
      }),
      source(),
      "BLOCKED",
    ],
    [
      "manual",
      definition({
        schedulingClass: "MANUAL_ONLY",
        cadenceMinutes: null,
        automatic: false,
      }),
      source(),
      "MANUAL",
    ],
  ])(
    "classifies %s sources without making them due",
    (_, policy, runtime, status) => {
      const result = evaluateScheduledSource({
        definition: policy,
        source: runtime,
        state: null,
        now: NOW,
      });
      expect(result.due).toBe(false);
      expect(result.freshnessStatus).toBe(status);
    },
  );

  it("stagger-initializes never-run sources instead of causing a startup storm", () => {
    const result = evaluateScheduledSource({
      definition: definition(),
      source: source({ lastSuccessfulSyncAt: null }),
      state: null,
      now: NOW,
    });
    expect(result.due).toBe(false);
    expect(result.nextScheduledAt!.getTime()).toBeGreaterThan(NOW.getTime());
    expect(result.action).toContain("staggered");
  });

  it("selects due sources for scheduler once and allows explicit eligible source runs", () => {
    const due = evaluateScheduledSource({
      definition: definition(),
      source: source(),
      state: null,
      now: NOW,
    });
    const waiting = evaluateScheduledSource({
      definition: definition({ sourceId: "fred" }),
      source: source({
        id: "a921c29e-d4b5-4dce-bee4-f45ec51af67c",
        slug: "fred",
        lastSuccessfulSyncAt: NOW,
      }),
      state: null,
      now: NOW,
    });
    expect(selectScheduleEvaluations([due, waiting])).toEqual([due]);
    expect(selectScheduleEvaluations([due, waiting], "fred")).toEqual([
      waiting,
    ]);
  });
});

describe("scheduler locking and failure isolation", () => {
  it("blocks active duplicate locks and recovers expired locks", () => {
    expect(
      lockCanBeAcquired(
        state({
          activeRunId: "6f41989c-469a-4f3f-866f-8562f31cc8dc",
          lockExpiresAt: new Date("2026-08-16T01:00:00.000Z"),
        }),
        NOW,
      ),
    ).toBe(false);
    expect(
      lockCanBeAcquired(
        state({
          activeRunId: "6f41989c-469a-4f3f-866f-8562f31cc8dc",
          lockExpiresAt: new Date("2026-08-15T23:59:59.000Z"),
        }),
        NOW,
      ),
    ).toBe(true);
  });

  it("releases completed locks, increments failures, and resets after success", async () => {
    let locked = false;
    let failures = 0;
    const store: SchedulerExecutionStore = {
      acquire: async () => {
        if (locked) return false;
        locked = true;
        return true;
      },
      complete: async () => {
        locked = false;
        failures = 0;
      },
      fail: async () => {
        locked = false;
        failures += 1;
      },
    };
    const timestamps = [NOW, new Date(NOW.getTime() + 1_000)];
    const failed = await executeScheduledSource({
      definition: definition(),
      source: source(),
      store,
      executor: async () => {
        throw new Error("sanitized failure");
      },
      runId: "75d4216d-6e1e-4641-b400-14505198b2f4",
      now: () => timestamps.shift() ?? NOW,
    });
    expect(failed.status).toBe("failed");
    expect(failures).toBe(1);
    const succeeded = await executeScheduledSource({
      definition: definition(),
      source: source(),
      store,
      executor: async () => ({ recordsCreated: 0, recordsUpdated: 0 }),
      runId: "f135219c-7d84-476e-a6e6-774a0be40268",
      now: () => NOW,
    });
    expect(succeeded.status).toBe("succeeded");
    expect(succeeded.recordsCreated).toBe(0);
    expect(failures).toBe(0);
  });

  it("keeps later sources running after an isolated source failure", async () => {
    const values = ["failed", "successful"];
    const results = await runWithConcurrency(values, 1, async (value) =>
      value === "failed" ? "recorded failure" : "completed",
    );
    expect(results).toEqual(["recorded failure", "completed"]);
  });
});
