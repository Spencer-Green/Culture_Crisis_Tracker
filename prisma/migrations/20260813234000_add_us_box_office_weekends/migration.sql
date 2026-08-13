CREATE TABLE "USBoxOfficeWeekend" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "sourceYear" INTEGER NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "weekendStart" DATE NOT NULL,
    "weekendEnd" DATE NOT NULL,
    "sourceDateLabel" TEXT NOT NULL,
    "occasion" TEXT,
    "totalGrossUsd" DECIMAL(18,0) NOT NULL,
    "top10GrossUsd" DECIMAL(18,0),
    "overallWowChangePct" DECIMAL(8,3),
    "top10WowChangePct" DECIMAL(8,3),
    "overallWowChangeLabel" TEXT,
    "top10WowChangeLabel" TEXT,
    "releaseCount" INTEGER,
    "topFilm" TEXT,
    "datasetSlug" TEXT NOT NULL,
    "datasetUpdatedAt" TIMESTAMPTZ(3),
    "sourceUrl" TEXT NOT NULL,
    "retrievedAt" TIMESTAMPTZ(3) NOT NULL,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "USBoxOfficeWeekend_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "USBoxOfficeWeekend_sourceId_sourceYear_weekNumber_key"
ON "USBoxOfficeWeekend"("sourceId", "sourceYear", "weekNumber");

CREATE INDEX "USBoxOfficeWeekend_weekendEnd_idx"
ON "USBoxOfficeWeekend"("weekendEnd");

CREATE INDEX "USBoxOfficeWeekend_sourceId_weekendEnd_idx"
ON "USBoxOfficeWeekend"("sourceId", "weekendEnd");

ALTER TABLE "USBoxOfficeWeekend"
ADD CONSTRAINT "USBoxOfficeWeekend_sourceId_fkey"
FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
