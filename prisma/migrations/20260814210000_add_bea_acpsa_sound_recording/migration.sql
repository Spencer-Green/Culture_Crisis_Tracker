CREATE TABLE "BEAACPSASoundRecordingYear" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "categoryLabel" TEXT NOT NULL,
    "acpsaOutputUsd" DECIMAL(20,0),
    "acpsaValueAddedUsd" DECIMAL(20,0),
    "acpsaEmployment" INTEGER,
    "acpsaEmployeeCompensationUsd" DECIMAL(20,0),
    "sourceArchiveUrl" TEXT NOT NULL,
    "sourceWorkbook" TEXT NOT NULL,
    "sourceTables" TEXT[],
    "unitMetadata" JSONB NOT NULL DEFAULT '{}',
    "retrievedAt" TIMESTAMPTZ(3) NOT NULL,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BEAACPSASoundRecordingYear_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BEAACPSASoundRecordingYear_sourceId_year_key"
ON "BEAACPSASoundRecordingYear"("sourceId", "year");

CREATE INDEX "BEAACPSASoundRecordingYear_year_idx"
ON "BEAACPSASoundRecordingYear"("year");

CREATE INDEX "BEAACPSASoundRecordingYear_sourceId_year_idx"
ON "BEAACPSASoundRecordingYear"("sourceId", "year");

ALTER TABLE "BEAACPSASoundRecordingYear"
ADD CONSTRAINT "BEAACPSASoundRecordingYear_sourceId_fkey"
FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
