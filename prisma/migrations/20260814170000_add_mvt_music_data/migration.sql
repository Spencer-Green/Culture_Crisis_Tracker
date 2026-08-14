CREATE TABLE "MVTGrassrootsMusicYear" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "venueCount" INTEGER,
    "permanentClosures" INTEGER,
    "venuesNoLongerOperating" INTEGER,
    "venuesUnprofitablePct" DECIMAL(7,2),
    "averageProfitMarginPct" DECIMAL(7,2),
    "eventCount" INTEGER,
    "ticketedLiveMusicEvents" INTEGER,
    "audienceVisits" INTEGER,
    "totalSectorRevenueGbp" DECIMAL(18,0),
    "liveMusicIncomeGbp" DECIMAL(18,0),
    "employment" INTEGER,
    "jobsLost" INTEGER,
    "townsWithoutRegularTouring" INTEGER,
    "sourceReportUrl" TEXT NOT NULL,
    "sourceReleaseUrl" TEXT NOT NULL,
    "sourcePublishedAt" TIMESTAMPTZ(3),
    "retrievedAt" TIMESTAMPTZ(3) NOT NULL,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MVTGrassrootsMusicYear_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MVTGrassrootsMusicYear_sourceId_year_key"
ON "MVTGrassrootsMusicYear"("sourceId", "year");

CREATE INDEX "MVTGrassrootsMusicYear_year_idx"
ON "MVTGrassrootsMusicYear"("year");

CREATE INDEX "MVTGrassrootsMusicYear_sourceId_year_idx"
ON "MVTGrassrootsMusicYear"("sourceId", "year");

ALTER TABLE "MVTGrassrootsMusicYear"
ADD CONSTRAINT "MVTGrassrootsMusicYear_sourceId_fkey"
FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
