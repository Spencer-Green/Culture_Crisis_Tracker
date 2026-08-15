CREATE TABLE "LPAPerformanceMarketYear" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "categoryLabel" TEXT NOT NULL,
    "geographyScope" TEXT NOT NULL DEFAULT 'NATIONAL',
    "revenueAud" DECIMAL(18,0),
    "attendance" INTEGER,
    "averageTicketPriceAud" DECIMAL(12,2),
    "sourceReportTitle" TEXT NOT NULL,
    "sourceReportUrl" TEXT NOT NULL,
    "sourceBundleUrl" TEXT NOT NULL,
    "sourcePublishedAt" TIMESTAMPTZ(3),
    "retrievedAt" TIMESTAMPTZ(3) NOT NULL,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LPAPerformanceMarketYear_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LPAPerformanceMarketYear_sourceId_year_category_geographyScope_key"
ON "LPAPerformanceMarketYear"("sourceId", "year", "category", "geographyScope");

CREATE INDEX "LPAPerformanceMarketYear_year_idx"
ON "LPAPerformanceMarketYear"("year");

CREATE INDEX "LPAPerformanceMarketYear_category_year_idx"
ON "LPAPerformanceMarketYear"("category", "year");

CREATE INDEX "LPAPerformanceMarketYear_sourceId_year_idx"
ON "LPAPerformanceMarketYear"("sourceId", "year");

ALTER TABLE "LPAPerformanceMarketYear"
ADD CONSTRAINT "LPAPerformanceMarketYear_sourceId_fkey"
FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
