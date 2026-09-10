export type SchedulerOnceCliOptions = {
  sourceId?: string;
  forceResearchTaskCadence: boolean;
  forceResearchRollingLimit: boolean;
};

export function parseSchedulerOnceOptions(
  arguments_: readonly string[],
): SchedulerOnceCliOptions {
  let sourceId: string | undefined;
  let forceResearchTaskCadence = false;
  let forceResearchRollingLimit = false;
  for (const argument of arguments_) {
    if (argument.startsWith("--source=")) {
      sourceId = argument.slice("--source=".length);
      continue;
    }
    if (argument === "--force-task") {
      forceResearchTaskCadence = true;
      continue;
    }
    if (argument === "--force-rolling-limit") {
      forceResearchRollingLimit = true;
      continue;
    }
    throw new Error(`Unknown scheduler argument "${argument}".`);
  }
  if (forceResearchTaskCadence && sourceId !== "research-agent") {
    throw new Error("--force-task is only valid with --source=research-agent.");
  }
  if (
    forceResearchRollingLimit &&
    (sourceId !== "research-agent" || !forceResearchTaskCadence)
  ) {
    throw new Error(
      "--force-rolling-limit requires --source=research-agent and --force-task.",
    );
  }
  return {
    sourceId,
    forceResearchTaskCadence,
    forceResearchRollingLimit,
  };
}
