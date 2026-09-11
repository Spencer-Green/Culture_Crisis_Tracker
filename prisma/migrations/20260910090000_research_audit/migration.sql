CREATE TABLE "ResearchAuditRun" (
 "id" UUID NOT NULL, "researchRunId" UUID, "promptVersion" TEXT NOT NULL,
 "modelId" TEXT NOT NULL, "inputHash" CHAR(64) NOT NULL, "status" TEXT NOT NULL,
 "fixtureName" TEXT, "cachedAuditId" UUID, "inputSnapshot" JSONB NOT NULL,
 "result" JSONB, "providerRequestId" TEXT, "usage" JSONB, "failureMessage" TEXT,
 "startedAt" TIMESTAMPTZ(3) NOT NULL, "completedAt" TIMESTAMPTZ(3), "latencyMs" INTEGER,
 CONSTRAINT "ResearchAuditRun_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ResearchAuditRun_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES "ResearchRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "ResearchAuditRun_status_check" CHECK ("status" IN ('RUNNING','SUCCEEDED','FAILED','CACHED'))
);
CREATE UNIQUE INDEX "ResearchAuditRun_researchRunId_promptVersion_key" ON "ResearchAuditRun"("researchRunId", "promptVersion");
CREATE INDEX "ResearchAuditRun_inputHash_status_idx" ON "ResearchAuditRun"("inputHash", "status");
CREATE INDEX "ResearchAuditRun_startedAt_status_idx" ON "ResearchAuditRun"("startedAt", "status");
