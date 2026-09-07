import { describe, expect, it } from "vitest";

import {
  evaluateResearchScheduler,
  researchSchedulerInspectionLines,
  RESEARCH_SCHEDULER_MAX_TASKS_PER_CYCLE,
  RESEARCH_SCHEDULER_ROLLING_EXECUTION_LIMIT,
  type ResearchTaskRunHistory,
  type ScheduledResearchTask,
} from "@/services/research/research-scheduler-core";
import { getResearchTask } from "@/services/research/research-tasks";

const NOW = new Date("2026-09-07T00:00:00Z");

function task(
  overrides: Partial<ScheduledResearchTask> = {},
): ScheduledResearchTask {
  return {
    task: getResearchTask("au-live-music-venue-viability"),
    enabled: true,
    cadenceMinutes: 24 * 60,
    priority: 100,
    ...overrides,
  };
}

function history(
  completedAt: string,
  overrides: Partial<ResearchTaskRunHistory> = {},
): ResearchTaskRunHistory {
  return {
    researchTaskId: "au-live-music-venue-viability",
    researchTaskVersion: "au-live-music-venue-viability-v1",
    status: "SUCCEEDED",
    startedAt: new Date(new Date(completedAt).getTime() - 1_000),
    completedAt: new Date(completedAt),
    ...overrides,
  };
}

describe("research scheduler due policy", () => {
  it("keeps the subsystem disabled even when a key is present", () => {
    const decision = evaluateResearchScheduler({
      enabled: false,
      apiKeyConfigured: true,
      now: NOW,
      tasks: [task()],
      history: [],
      rollingRunCount: 0,
    });
    expect(decision.selectedTask).toBeNull();
    expect(decision.skipReason).toBe("DISABLED");
  });

  it("selects an enabled never-run task as due", () => {
    const decision = evaluateResearchScheduler({
      enabled: true,
      apiKeyConfigured: true,
      now: NOW,
      tasks: [task()],
      history: [],
      rollingRunCount: 0,
    });
    expect(decision.selectedTask?.task.id).toBe(
      "au-live-music-venue-viability",
    );
    expect(decision.nextDueAt).toEqual(NOW);
  });

  it("selects at most one due task by priority", () => {
    const second = task({
      task: {
        ...getResearchTask("au-live-music-venue-viability"),
        id: "second-task",
        version: "second-task-v1",
      },
      priority: 50,
    });
    const decision = evaluateResearchScheduler({
      enabled: true,
      apiKeyConfigured: true,
      now: NOW,
      tasks: [second, task()],
      history: [],
      rollingRunCount: 0,
    });
    expect(RESEARCH_SCHEDULER_MAX_TASKS_PER_CYCLE).toBe(1);
    expect(decision.selectedTask?.task.id).toBe(
      "au-live-music-venue-viability",
    );
  });

  it("blocks execution at the rolling 24-hour ceiling", () => {
    const decision = evaluateResearchScheduler({
      enabled: true,
      apiKeyConfigured: true,
      now: NOW,
      tasks: [task()],
      history: [],
      rollingRunCount: RESEARCH_SCHEDULER_ROLLING_EXECUTION_LIMIT,
    });
    expect(decision.selectedTask).toBeNull();
    expect(decision.skipReason).toBe("ROLLING_EXECUTION_LIMIT");
  });

  it.each(["SUCCEEDED", "FAILED"] as const)(
    "%s provider execution advances the 24-hour task cadence",
    (status) => {
      const decision = evaluateResearchScheduler({
        enabled: true,
        apiKeyConfigured: true,
        now: NOW,
        tasks: [task()],
        history: [
          history("2026-09-06T12:00:00Z", {
            status,
          }),
        ],
        rollingRunCount: 1,
      });
      expect(decision.selectedTask).toBeNull();
      expect(decision.skipReason).toBe("NO_TASK_DUE");
      expect(decision.nextDueAt?.toISOString()).toBe(
        "2026-09-07T12:00:00.000Z",
      );
    },
  );

  it("treats a new task version independently of old-version history", () => {
    const versionedTask = task({
      task: {
        ...getResearchTask("au-live-music-venue-viability"),
        version: "au-live-music-venue-viability-v2",
      },
    });
    const decision = evaluateResearchScheduler({
      enabled: true,
      apiKeyConfigured: true,
      now: NOW,
      tasks: [versionedTask],
      history: [history("2026-09-06T23:00:00Z")],
      rollingRunCount: 1,
    });
    expect(decision.selectedTask?.task.version).toBe(
      "au-live-music-venue-viability-v2",
    );
  });

  it("reports missing-key preflight separately from completed research", () => {
    const decision = evaluateResearchScheduler({
      enabled: true,
      apiKeyConfigured: false,
      now: NOW,
      tasks: [task()],
      history: [],
      rollingRunCount: 0,
    });
    expect(decision.skipReason).toBe("MISSING_API_KEY");
    expect(decision.lastRun).toBeNull();
  });

  it("formats concise operational inspection fields without evidence payloads", () => {
    const decision = evaluateResearchScheduler({
      enabled: true,
      apiKeyConfigured: true,
      now: NOW,
      tasks: [task()],
      history: [],
      rollingRunCount: 1,
    });
    const output = researchSchedulerInspectionLines(decision, {
      running: false,
      expiresAt: null,
    }).join("\n");
    expect(output).toContain("research tasks: 1");
    expect(output).toContain(
      "due research task: au-live-music-venue-viability",
    );
    expect(output).toContain("rolling 24h executions: 1/2");
    expect(output).toContain("lock: available");
    expect(output).not.toMatch(/RESEARCH_SUMMARY|nativeSearchTrace|prompt/i);
  });
});
