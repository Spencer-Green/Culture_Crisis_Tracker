CREATE TABLE "LunaStorySynthesis" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "identityKey" CHAR(64) NOT NULL,
    "storyKey" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "representativeArticleId" UUID NOT NULL,
    "evidenceFingerprint" CHAR(64) NOT NULL,
    "evidenceVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "outputSchemaVersion" TEXT NOT NULL,
    "requestedModel" TEXT NOT NULL,
    "responseModel" TEXT,
    "status" TEXT NOT NULL,
    "evidenceMetadata" JSONB NOT NULL DEFAULT '{}',
    "synthesisPayload" JSONB,
    "inputTokens" INTEGER,
    "cachedInputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "estimatedCostUsd" DECIMAL(12,8),
    "latencyMs" INTEGER,
    "attemptedAt" TIMESTAMPTZ(3) NOT NULL,
    "generatedAt" TIMESTAMPTZ(3),
    "nextAttemptAt" TIMESTAMPTZ(3),
    "leaseId" UUID,
    "leaseExpiresAt" TIMESTAMPTZ(3),
    "failureKind" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LunaStorySynthesis_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LunaStorySynthesis_status_check" CHECK ("status" IN ('PROCESSING', 'VALIDATED', 'FAILED')),
    CONSTRAINT "LunaStorySynthesis_validated_payload_check" CHECK (
        "status" <> 'VALIDATED' OR
        ("synthesisPayload" IS NOT NULL AND "generatedAt" IS NOT NULL)
    ),
    CONSTRAINT "LunaStorySynthesis_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "LunaStorySynthesis_identityKey_key" ON "LunaStorySynthesis"("identityKey");
CREATE INDEX "LunaStorySynthesis_clusterId_status_generatedAt_idx" ON "LunaStorySynthesis"("clusterId", "status", "generatedAt");
CREATE INDEX "LunaStorySynthesis_storyKey_status_generatedAt_idx" ON "LunaStorySynthesis"("storyKey", "status", "generatedAt");
CREATE INDEX "LunaStorySynthesis_status_nextAttemptAt_idx" ON "LunaStorySynthesis"("status", "nextAttemptAt");
CREATE INDEX "LunaStorySynthesis_attemptedAt_idx" ON "LunaStorySynthesis"("attemptedAt");
CREATE INDEX "LunaStorySynthesis_sourceId_attemptedAt_idx" ON "LunaStorySynthesis"("sourceId", "attemptedAt");

CREATE TABLE "LunaStorySynthesisAttempt" (
    "id" UUID NOT NULL,
    "synthesisId" UUID NOT NULL,
    "leaseId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "responseModel" TEXT,
    "inputTokens" INTEGER,
    "cachedInputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "estimatedCostUsd" DECIMAL(12,8),
    "latencyMs" INTEGER,
    "failureKind" TEXT,
    "failureMessage" TEXT,
    "attemptedAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LunaStorySynthesisAttempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LunaStorySynthesisAttempt_status_check" CHECK ("status" IN ('RUNNING', 'VALIDATED', 'FAILED')),
    CONSTRAINT "LunaStorySynthesisAttempt_synthesisId_fkey" FOREIGN KEY ("synthesisId") REFERENCES "LunaStorySynthesis"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "LunaStorySynthesisAttempt_leaseId_key" ON "LunaStorySynthesisAttempt"("leaseId");
CREATE INDEX "LunaStorySynthesisAttempt_attemptedAt_idx" ON "LunaStorySynthesisAttempt"("attemptedAt");
CREATE INDEX "LunaStorySynthesisAttempt_synthesisId_attemptedAt_idx" ON "LunaStorySynthesisAttempt"("synthesisId", "attemptedAt");
CREATE INDEX "LunaStorySynthesisAttempt_status_attemptedAt_idx" ON "LunaStorySynthesisAttempt"("status", "attemptedAt");
