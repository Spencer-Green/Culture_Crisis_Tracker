import {
  parseResearchInspectionLimit,
  parseResearchReviewDecision,
  validateResearchReviewReason,
  type ResearchInspectFilters,
  type ResearchReviewDecision,
} from "@/services/research/research-staging-core";

export type ResearchOnceOptions = {
  taskId: string;
  persist: boolean;
  debugSearchTrace: boolean;
};

export async function persistResearchResultWhenRequested<
  Result,
  Persisted,
>(input: {
  persist: boolean;
  value: Result;
  writer: (value: Result) => Promise<Persisted>;
}): Promise<Persisted | undefined> {
  if (!input.persist) return undefined;
  return input.writer(input.value);
}

function readUniqueOption(
  arguments_: string[],
  name: string,
): string | undefined {
  const values = arguments_
    .filter((argument) => argument.startsWith(`${name}=`))
    .map((argument) => argument.slice(name.length + 1).trim());
  if (values.length > 1) throw new Error(`Provide ${name} only once.`);
  if (values.length === 1 && !values[0]) {
    throw new Error(`${name} requires a value.`);
  }
  return values[0];
}

export function parseResearchOnceOptions(
  arguments_: string[],
): ResearchOnceOptions {
  const allowed = new Set(["--persist", "--debug-search-trace"]);
  for (const argument of arguments_) {
    if (allowed.has(argument) || argument.startsWith("--task=")) continue;
    throw new Error(`Unknown option: ${argument}`);
  }
  const taskId = readUniqueOption(arguments_, "--task");
  if (!taskId) {
    throw new Error(
      "Usage: npm run research:once -- --task=au-live-music-venue-viability [--persist]",
    );
  }
  return {
    taskId,
    persist: arguments_.includes("--persist"),
    debugSearchTrace: arguments_.includes("--debug-search-trace"),
  };
}

export function parseResearchInspectOptions(
  arguments_: string[],
): ResearchInspectFilters {
  const names = ["--task", "--status", "--candidate", "--run", "--limit"];
  for (const argument of arguments_) {
    if (names.some((name) => argument.startsWith(`${name}=`))) continue;
    throw new Error(`Unknown option: ${argument}`);
  }
  return {
    taskId: readUniqueOption(arguments_, "--task"),
    status: readUniqueOption(arguments_, "--status"),
    candidateId: readUniqueOption(arguments_, "--candidate"),
    runId: readUniqueOption(arguments_, "--run"),
    limit: parseResearchInspectionLimit(
      readUniqueOption(arguments_, "--limit"),
    ),
  };
}

export type ResearchReviewOptions = {
  candidateId: string;
  decision: ResearchReviewDecision;
  reason: string;
  reviewerId?: string;
};

export function parseResearchReviewOptions(
  arguments_: string[],
): ResearchReviewOptions {
  const names = ["--candidate", "--decision", "--reason", "--reviewer"];
  for (const argument of arguments_) {
    if (names.some((name) => argument.startsWith(`${name}=`))) continue;
    throw new Error(`Unknown option: ${argument}`);
  }
  const candidateId = readUniqueOption(arguments_, "--candidate");
  const decision = readUniqueOption(arguments_, "--decision");
  const reason = readUniqueOption(arguments_, "--reason");
  if (!candidateId || !decision || !reason) {
    throw new Error(
      'Usage: npm run research:review -- --candidate=<id> --decision=<decision> --reason="..."',
    );
  }
  return {
    candidateId,
    decision: parseResearchReviewDecision(decision),
    reason: validateResearchReviewReason(reason),
    reviewerId: readUniqueOption(arguments_, "--reviewer"),
  };
}
