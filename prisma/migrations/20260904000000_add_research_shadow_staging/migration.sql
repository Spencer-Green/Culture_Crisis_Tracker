CREATE TYPE "ResearchRunStatus" AS ENUM ('SUCCEEDED', 'FAILED');

CREATE TYPE "ResearchTraceConfidence" AS ENUM (
    'TRACE_OPENED',
    'TRACE_ATTEMPTED',
    'MODEL_REPORTED_ONLY'
);

CREATE TYPE "ResearchEvidenceMediation" AS ENUM (
    'DIRECTLY_OPENED',
    'SEARCH_MEDIATED',
    'MODEL_REPORTED'
);

CREATE TYPE "ResearchCandidateValidationState" AS ENUM ('VALIDATED');

CREATE TYPE "ResearchCandidateReviewDecision" AS ENUM (
    'APPROVED_FOR_INGESTION_INVESTIGATION',
    'REJECTED',
    'ALREADY_COVERED',
    'NOT_USEFUL',
    'SUPERSEDED'
);

CREATE TABLE "ResearchRun" (
    "id" UUID NOT NULL,
    "researchTaskId" TEXT NOT NULL,
    "researchTaskVersion" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "stage1PromptVersion" TEXT NOT NULL,
    "stage2PromptVersion" TEXT NOT NULL,
    "contractVersion" TEXT NOT NULL,
    "status" "ResearchRunStatus" NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "durationMs" INTEGER,
    "stage1ResponseId" TEXT,
    "stage1Status" TEXT,
    "stage1InputTokens" INTEGER,
    "stage1CachedInputTokens" INTEGER,
    "stage1OutputTokens" INTEGER,
    "stage1ReasoningTokens" INTEGER,
    "stage1TotalTokens" INTEGER,
    "stage1LatencyMs" INTEGER,
    "stage2ResponseId" TEXT,
    "stage2Status" TEXT,
    "stage2InputTokens" INTEGER,
    "stage2CachedInputTokens" INTEGER,
    "stage2OutputTokens" INTEGER,
    "stage2ReasoningTokens" INTEGER,
    "stage2TotalTokens" INTEGER,
    "stage2LatencyMs" INTEGER,
    "combinedTotalTokens" INTEGER,
    "combinedLatencyMs" INTEGER,
    "stage1Artifact" TEXT,
    "resultSummary" TEXT,
    "researchLimitations" JSONB,
    "nativeSearchTrace" JSONB,
    "responseDiagnostics" JSONB,
    "failureKind" TEXT,
    "failureMessage" TEXT,
    "failureReasons" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResearchSourceDocument" (
    "id" UUID NOT NULL,
    "researchTaskId" TEXT NOT NULL,
    "researchTaskVersion" TEXT NOT NULL,
    "sourceFingerprint" CHAR(64) NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),
    "publishedAtRaw" TEXT NOT NULL,
    "reportingPeriodStart" TIMESTAMPTZ(3),
    "reportingPeriodEnd" TIMESTAMPTZ(3),
    "reportingPeriodRaw" TEXT NOT NULL,
    "sourceRole" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "observation" JSONB NOT NULL,
    "limitations" JSONB NOT NULL,
    "traceConfidence" "ResearchTraceConfidence" NOT NULL,
    "evidenceMediation" "ResearchEvidenceMediation" NOT NULL,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ResearchSourceDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResearchRunSource" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "sourceDocumentId" UUID NOT NULL,
    "sourceIndex" INTEGER NOT NULL,
    "traceConfidence" "ResearchTraceConfidence" NOT NULL,
    "evidenceMediation" "ResearchEvidenceMediation" NOT NULL,
    "claimSnapshot" TEXT NOT NULL,
    "observationSnapshot" JSONB NOT NULL,
    "limitationsSnapshot" JSONB NOT NULL,
    "retrievedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchRunSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResearchCandidate" (
    "id" UUID NOT NULL,
    "sourceDocumentId" UUID NOT NULL,
    "researchTaskId" TEXT NOT NULL,
    "researchTaskVersion" TEXT NOT NULL,
    "candidateFingerprint" CHAR(64) NOT NULL,
    "candidateType" TEXT NOT NULL,
    "geography" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "reportingPeriodStart" TIMESTAMPTZ(3),
    "reportingPeriodEnd" TIMESTAMPTZ(3),
    "claim" TEXT NOT NULL,
    "observations" JSONB NOT NULL,
    "sourceRole" TEXT NOT NULL,
    "limitations" JSONB NOT NULL,
    "authority" TEXT NOT NULL,
    "freshness" TEXT NOT NULL,
    "ingestionFeasibility" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "traceConfidence" "ResearchTraceConfidence" NOT NULL,
    "validationState" "ResearchCandidateValidationState" NOT NULL DEFAULT 'VALIDATED',
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ResearchCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResearchRunCandidate" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "candidateIndex" INTEGER NOT NULL,
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchRunCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResearchCandidateReviewEvent" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "supersedesReviewEventId" UUID,
    "decision" "ResearchCandidateReviewDecision" NOT NULL,
    "reason" TEXT NOT NULL,
    "candidateFingerprint" CHAR(64) NOT NULL,
    "candidateSnapshot" JSONB NOT NULL,
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchCandidateReviewEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResearchRun_researchTaskId_startedAt_idx" ON "ResearchRun"("researchTaskId", "startedAt");
CREATE INDEX "ResearchRun_status_startedAt_idx" ON "ResearchRun"("status", "startedAt");
CREATE INDEX "ResearchRun_providerId_modelId_startedAt_idx" ON "ResearchRun"("providerId", "modelId", "startedAt");

CREATE UNIQUE INDEX "ResearchSourceDocument_sourceFingerprint_key" ON "ResearchSourceDocument"("sourceFingerprint");
CREATE INDEX "ResearchSourceDocument_researchTaskId_lastSeenAt_idx" ON "ResearchSourceDocument"("researchTaskId", "lastSeenAt");
CREATE INDEX "ResearchSourceDocument_canonicalUrl_idx" ON "ResearchSourceDocument"("canonicalUrl");
CREATE INDEX "ResearchSourceDocument_traceConfidence_lastSeenAt_idx" ON "ResearchSourceDocument"("traceConfidence", "lastSeenAt");

CREATE UNIQUE INDEX "ResearchRunSource_runId_sourceIndex_key" ON "ResearchRunSource"("runId", "sourceIndex");
CREATE INDEX "ResearchRunSource_sourceDocumentId_createdAt_idx" ON "ResearchRunSource"("sourceDocumentId", "createdAt");

CREATE UNIQUE INDEX "ResearchCandidate_candidateFingerprint_key" ON "ResearchCandidate"("candidateFingerprint");
CREATE INDEX "ResearchCandidate_researchTaskId_lastSeenAt_idx" ON "ResearchCandidate"("researchTaskId", "lastSeenAt");
CREATE INDEX "ResearchCandidate_sourceDocumentId_idx" ON "ResearchCandidate"("sourceDocumentId");
CREATE INDEX "ResearchCandidate_validationState_lastSeenAt_idx" ON "ResearchCandidate"("validationState", "lastSeenAt");

CREATE UNIQUE INDEX "ResearchRunCandidate_runId_candidateIndex_key" ON "ResearchRunCandidate"("runId", "candidateIndex");
CREATE INDEX "ResearchRunCandidate_candidateId_createdAt_idx" ON "ResearchRunCandidate"("candidateId", "createdAt");

CREATE UNIQUE INDEX "ResearchCandidateReviewEvent_supersedesReviewEventId_key" ON "ResearchCandidateReviewEvent"("supersedesReviewEventId");
CREATE INDEX "ResearchCandidateReviewEvent_candidateId_reviewedAt_idx" ON "ResearchCandidateReviewEvent"("candidateId", "reviewedAt");
CREATE INDEX "ResearchCandidateReviewEvent_decision_reviewedAt_idx" ON "ResearchCandidateReviewEvent"("decision", "reviewedAt");

ALTER TABLE "ResearchRunSource" ADD CONSTRAINT "ResearchRunSource_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchRunSource" ADD CONSTRAINT "ResearchRunSource_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "ResearchSourceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResearchCandidate" ADD CONSTRAINT "ResearchCandidate_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "ResearchSourceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResearchRunCandidate" ADD CONSTRAINT "ResearchRunCandidate_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchRunCandidate" ADD CONSTRAINT "ResearchRunCandidate_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ResearchCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResearchCandidateReviewEvent" ADD CONSTRAINT "ResearchCandidateReviewEvent_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ResearchCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResearchCandidateReviewEvent" ADD CONSTRAINT "ResearchCandidateReviewEvent_supersedesReviewEventId_fkey" FOREIGN KEY ("supersedesReviewEventId") REFERENCES "ResearchCandidateReviewEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
