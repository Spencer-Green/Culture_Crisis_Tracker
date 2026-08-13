-- CreateTable
CREATE TABLE "BroadwayMarketWeek" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "sourceWeekId" INTEGER NOT NULL,
    "seasonWeekNumber" INTEGER NOT NULL,
    "weekStart" DATE NOT NULL,
    "weekEnding" DATE NOT NULL,
    "grossUsd" DECIMAL(18,2) NOT NULL,
    "attendance" INTEGER NOT NULL,
    "showCount" INTEGER,
    "capacityPct" DECIMAL(7,2),
    "averageTicketPriceUsd" DECIMAL(12,2),
    "performanceCount" INTEGER,
    "previewCount" INTEGER,
    "sourceUrl" TEXT NOT NULL,
    "retrievedAt" TIMESTAMPTZ(3) NOT NULL,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BroadwayMarketWeek_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BroadwayMarketWeek_sourceId_weekEnding_key" ON "BroadwayMarketWeek"("sourceId", "weekEnding");

-- CreateIndex
CREATE INDEX "BroadwayMarketWeek_weekEnding_idx" ON "BroadwayMarketWeek"("weekEnding");

-- CreateIndex
CREATE INDEX "BroadwayMarketWeek_sourceId_weekEnding_idx" ON "BroadwayMarketWeek"("sourceId", "weekEnding");

-- AddForeignKey
ALTER TABLE "BroadwayMarketWeek" ADD CONSTRAINT "BroadwayMarketWeek_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
