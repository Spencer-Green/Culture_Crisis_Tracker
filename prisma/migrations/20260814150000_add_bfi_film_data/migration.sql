-- CreateTable
CREATE TABLE "BFIWeekendBoxOffice" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "weekendStart" DATE NOT NULL,
    "weekendEnd" DATE NOT NULL,
    "sourceDateLabel" TEXT NOT NULL,
    "reportedGrossGbp" DECIMAL(18,0) NOT NULL,
    "top15GrossGbp" DECIMAL(18,0) NOT NULL,
    "releaseCount" INTEGER NOT NULL,
    "topFilm" TEXT,
    "topFilmGrossGbp" DECIMAL(18,0),
    "top3GrossGbp" DECIMAL(18,0),
    "top5GrossGbp" DECIMAL(18,0),
    "top10GrossGbp" DECIMAL(18,0),
    "sourceFileUrl" TEXT NOT NULL,
    "sourceFileName" TEXT NOT NULL,
    "sourceFormat" TEXT NOT NULL,
    "sourcePublishedAt" TIMESTAMPTZ(3),
    "retrievedAt" TIMESTAMPTZ(3) NOT NULL,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "BFIWeekendBoxOffice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BFIFilmMarketYear" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "cinemaAdmissionsMillions" DECIMAL(10,1),
    "ukBoxOfficeGrossGbpM" DECIMAL(12,1),
    "releaseCount" INTEGER,
    "filmProductionSpendGbpM" DECIMAL(12,1),
    "filmProductionCount" INTEGER,
    "hetvProductionSpendGbpM" DECIMAL(12,1),
    "hetvProductionCount" INTEGER,
    "sourceBoxOfficeUrl" TEXT,
    "sourceProductionUrl" TEXT,
    "sourceYearbook" TEXT NOT NULL,
    "retrievedAt" TIMESTAMPTZ(3) NOT NULL,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "BFIFilmMarketYear_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BFIWeekendBoxOffice_weekendEnd_idx" ON "BFIWeekendBoxOffice"("weekendEnd");
CREATE INDEX "BFIWeekendBoxOffice_sourceId_weekendEnd_idx" ON "BFIWeekendBoxOffice"("sourceId", "weekendEnd");
CREATE UNIQUE INDEX "BFIWeekendBoxOffice_sourceId_weekendEnd_key" ON "BFIWeekendBoxOffice"("sourceId", "weekendEnd");
CREATE INDEX "BFIFilmMarketYear_year_idx" ON "BFIFilmMarketYear"("year");
CREATE INDEX "BFIFilmMarketYear_sourceId_year_idx" ON "BFIFilmMarketYear"("sourceId", "year");
CREATE UNIQUE INDEX "BFIFilmMarketYear_sourceId_year_key" ON "BFIFilmMarketYear"("sourceId", "year");

ALTER TABLE "BFIWeekendBoxOffice" ADD CONSTRAINT "BFIWeekendBoxOffice_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BFIFilmMarketYear" ADD CONSTRAINT "BFIFilmMarketYear_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
