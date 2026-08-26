CREATE TYPE "ScreenAustraliaBoxOfficePeriodType" AS ENUM (
    'WEEKLY_TOP_5',
    'AUSTRALIAN_YTD',
    'MONTHLY_TOP_20',
    'OVERALL_YTD_TOP_50'
);

CREATE TABLE "ScreenAustraliaBoxOfficeObservation" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "reportDate" DATE NOT NULL,
    "periodType" "ScreenAustraliaBoxOfficePeriodType" NOT NULL,
    "rank" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "periodGrossAud" DECIMAL(18,0),
    "cumulativeGrossAud" DECIMAL(18,0),
    "releaseWeeks" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "retrievedAt" TIMESTAMPTZ(3) NOT NULL,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ScreenAustraliaBoxOfficeObservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScreenAustraliaBoxOfficeObservation_sourceId_reportDate_periodType_rank_normalizedTitle_key"
ON "ScreenAustraliaBoxOfficeObservation"("sourceId", "reportDate", "periodType", "rank", "normalizedTitle");

CREATE INDEX "ScreenAustraliaBoxOfficeObservation_reportDate_idx"
ON "ScreenAustraliaBoxOfficeObservation"("reportDate");

CREATE INDEX "ScreenAustraliaBoxOfficeObservation_sourceId_reportDate_idx"
ON "ScreenAustraliaBoxOfficeObservation"("sourceId", "reportDate");

CREATE INDEX "ScreenAustraliaBoxOfficeObservation_periodType_reportDate_idx"
ON "ScreenAustraliaBoxOfficeObservation"("periodType", "reportDate");

ALTER TABLE "ScreenAustraliaBoxOfficeObservation"
ADD CONSTRAINT "ScreenAustraliaBoxOfficeObservation_sourceId_fkey"
FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
