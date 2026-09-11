CREATE TABLE "ResearchEvidenceCheck" (
 "id" UUID NOT NULL, "researchRunId" UUID NOT NULL, "contractVersion" TEXT NOT NULL,
 "inputHash" CHAR(64) NOT NULL, "inputSnapshot" JSONB NOT NULL, "result" JSONB NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ResearchEvidenceCheck_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ResearchEvidenceCheck_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES "ResearchRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ResearchEvidenceCheck_researchRunId_contractVersion_key" ON "ResearchEvidenceCheck"("researchRunId", "contractVersion");
