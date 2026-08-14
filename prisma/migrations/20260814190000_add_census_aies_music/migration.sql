CREATE TABLE "CensusRecordIndustryYear" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "naicsCode" VARCHAR(6) NOT NULL,
    "industryLabel" TEXT NOT NULL,
    "revenueUsd" DECIMAL(20,0),
    "payrollUsd" DECIMAL(20,0),
    "employment" INTEGER,
    "operatingExpensesUsd" DECIMAL(20,0),
    "revenueFlag" TEXT,
    "payrollFlag" TEXT,
    "employmentFlag" TEXT,
    "operatingExpensesFlag" TEXT,
    "revenueCvPct" DECIMAL(7,2),
    "payrollCvPct" DECIMAL(7,2),
    "employmentCvPct" DECIMAL(7,2),
    "operatingExpensesCvPct" DECIMAL(7,2),
    "sourceTable" TEXT NOT NULL,
    "sourceVintage" TEXT NOT NULL,
    "retrievedAt" TIMESTAMPTZ(3) NOT NULL,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CensusRecordIndustryYear_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CensusRecordIndustryYear_sourceId_year_naicsCode_sourceVintage_key"
ON "CensusRecordIndustryYear"("sourceId", "year", "naicsCode", "sourceVintage");

CREATE INDEX "CensusRecordIndustryYear_year_idx"
ON "CensusRecordIndustryYear"("year");

CREATE INDEX "CensusRecordIndustryYear_sourceId_year_idx"
ON "CensusRecordIndustryYear"("sourceId", "year");

CREATE INDEX "CensusRecordIndustryYear_naicsCode_idx"
ON "CensusRecordIndustryYear"("naicsCode");

ALTER TABLE "CensusRecordIndustryYear"
ADD CONSTRAINT "CensusRecordIndustryYear_sourceId_fkey"
FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
