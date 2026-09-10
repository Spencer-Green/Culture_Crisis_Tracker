import { describe, expect, it } from "vitest";

import { parseSchedulerOnceOptions } from "@/services/scheduler/scheduler-cli-core";

describe("scheduler once CLI", () => {
  it("parses an explicit research task cadence override", () => {
    expect(
      parseSchedulerOnceOptions(["--source=research-agent", "--force-task"]),
    ).toEqual({
      sourceId: "research-agent",
      forceResearchTaskCadence: true,
      forceResearchRollingLimit: false,
    });
  });

  it("parses an explicit targeted rolling-limit override", () => {
    expect(
      parseSchedulerOnceOptions([
        "--source=research-agent",
        "--force-task",
        "--force-rolling-limit",
      ]),
    ).toEqual({
      sourceId: "research-agent",
      forceResearchTaskCadence: true,
      forceResearchRollingLimit: true,
    });
  });

  it("keeps ordinary targeted and worker-style invocations unforced", () => {
    expect(parseSchedulerOnceOptions(["--source=research-agent"])).toEqual({
      sourceId: "research-agent",
      forceResearchTaskCadence: false,
      forceResearchRollingLimit: false,
    });
    expect(parseSchedulerOnceOptions([])).toEqual({
      forceResearchTaskCadence: false,
      forceResearchRollingLimit: false,
    });
  });

  it("rejects force-task outside the research-agent target", () => {
    expect(() => parseSchedulerOnceOptions(["--force-task"])).toThrow(
      "only valid with --source=research-agent",
    );
    expect(() =>
      parseSchedulerOnceOptions(["--source=rss", "--force-task"]),
    ).toThrow("only valid with --source=research-agent");
  });

  it("rejects force-rolling-limit without an explicit forced research target", () => {
    expect(() => parseSchedulerOnceOptions(["--force-rolling-limit"])).toThrow(
      "requires --source=research-agent and --force-task",
    );
    expect(() =>
      parseSchedulerOnceOptions([
        "--source=research-agent",
        "--force-rolling-limit",
      ]),
    ).toThrow("requires --source=research-agent and --force-task");
    expect(() =>
      parseSchedulerOnceOptions([
        "--source=rss",
        "--force-task",
        "--force-rolling-limit",
      ]),
    ).toThrow("only valid with --source=research-agent");
  });
});
