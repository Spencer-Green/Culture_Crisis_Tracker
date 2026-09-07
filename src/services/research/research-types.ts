import type { ResearchResultV1 } from "@/services/research/research-schema";

export type ResearchTaskV1 = {
  id: string;
  version: string;
  sector: string;
  geography: string;
  objective: string;
  existingEvidenceContext: readonly string[];
};

export type SanitizedResearchValue =
  | null
  | boolean
  | number
  | string
  | SanitizedResearchValue[]
  | { [key: string]: SanitizedResearchValue };

export type NativeSearchTraceV1 = {
  calls: Array<{
    sequence: number;
    item: SanitizedResearchValue;
  }>;
  annotations: Array<{
    outputSequence: number;
    contentSequence: number;
    annotationSequence: number;
    annotation: SanitizedResearchValue;
  }>;
};

export type ResearchProviderUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

export type ResearchResponseDiagnosticsV1 = {
  responseId: string | null;
  responseStatus: string | null;
  outputItemCount: number;
  outputItemTypes: string[];
  messageItems: Array<{
    sequence: number;
    id: string | null;
    status: string | null;
    contentTypes: string[];
    outputTextPresent: boolean;
    annotationCount: number;
  }>;
  incompleteDetails: SanitizedResearchValue;
  error: SanitizedResearchValue;
};

export type ResearchProviderResult = {
  provider: string;
  model: string;
  providerRequestId: string | null;
  status: "completed";
  outputText: string;
  nativeSearchTrace: NativeSearchTraceV1;
  responseDiagnostics: ResearchResponseDiagnosticsV1;
  usage: ResearchProviderUsage;
  latencyMs: number;
};

export type ResearchProviderRequest = {
  task: ResearchTaskV1;
  instructions: string;
  input: string;
};

export interface ResearchProvider {
  researchWithNativeWeb(
    request: ResearchProviderRequest,
  ): Promise<ResearchProviderResult>;
  structureResearch(
    request: ResearchProviderRequest,
  ): Promise<ResearchProviderResult>;
}

export type ResearchStage1SourceV1 = {
  url: string;
  publisher: string;
  title: string;
  publishedAt: string;
  reportingPeriod: string;
  sourceRole: string;
  claim: string;
  observation: string;
  limitations: string;
  rawBlock: string;
  traceStatus: ResearchSourceTraceStatus;
};

export type ResearchSourceTraceStatus =
  "TRACE_OPENED" | "TRACE_ATTEMPTED" | "MODEL_REPORTED_ONLY";

export type ResearchFailureCode =
  | "STAGE1_EXECUTION_FAILURE"
  | "STAGE1_NO_FINAL_TEXT"
  | "STAGE1_NO_WEB_SEARCH"
  | "STAGE1_ARTIFACT_INVALID"
  | "STAGE2_EXECUTION_FAILURE"
  | "STAGE2_NO_FINAL_TEXT"
  | "STAGE2_JSON_PARSE_FAILURE"
  | "STAGE2_SCHEMA_FAILURE"
  | "CROSS_STAGE_PROVENANCE_FAILURE";

export type ResearchStage1RunResult = {
  artifact: string;
  sources: ResearchStage1SourceV1[];
  provider: ResearchProviderResult;
};

export type ResearchRunResult = {
  task: ResearchTaskV1;
  result: ResearchResultV1;
  stage1: ResearchStage1RunResult;
  stage2: {
    provider: ResearchProviderResult;
  };
  startedAt: Date;
  completedAt: Date;
  crossStageValidation: {
    matchedCandidates: number;
    reasons: string[];
  };
  usage: {
    totalTokens: number;
    totalLatencyMs: number;
  };
};
