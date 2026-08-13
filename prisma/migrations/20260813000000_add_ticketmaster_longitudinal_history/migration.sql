CREATE TABLE "TicketmasterEventStatusChange" (
    "id" UUID NOT NULL,
    "ticketmasterEventId" UUID NOT NULL,
    "ingestionRunId" UUID NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "countryCode" VARCHAR(3) NOT NULL,
    "segmentName" TEXT NOT NULL,
    "previousStatus" TEXT NOT NULL,
    "newStatus" TEXT NOT NULL,
    "changedAt" TIMESTAMPTZ(3) NOT NULL,
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketmasterEventStatusChange_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TicketmasterSupplySnapshot" (
    "id" UUID NOT NULL,
    "ingestionRunId" UUID NOT NULL,
    "capturedAt" TIMESTAMPTZ(3) NOT NULL,
    "windowDays" INTEGER NOT NULL,
    "countryCode" VARCHAR(3) NOT NULL,
    "segmentName" TEXT NOT NULL,
    "uniqueEventCount" INTEGER NOT NULL,
    "activeVenueCount" INTEGER NOT NULL,
    "eventsPerVenue" DECIMAL(14,6),
    "onsaleCount" INTEGER NOT NULL,
    "offsaleCount" INTEGER NOT NULL,
    "cancelledCount" INTEGER NOT NULL,
    "canceledCount" INTEGER NOT NULL,
    "postponedCount" INTEGER NOT NULL,
    "rescheduledCount" INTEGER NOT NULL,
    "priceRangeAvailableCount" INTEGER NOT NULL,
    "priceCoveragePct" DECIMAL(7,4),
    "statusCounts" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketmasterSupplySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TicketmasterEventStatusChange_ticketmasterEventId_ingestionRunId_key" ON "TicketmasterEventStatusChange"("ticketmasterEventId", "ingestionRunId");
CREATE INDEX "TicketmasterEventStatusChange_observedAt_idx" ON "TicketmasterEventStatusChange"("observedAt");
CREATE INDEX "TicketmasterEventStatusChange_countryCode_segmentName_observedAt_idx" ON "TicketmasterEventStatusChange"("countryCode", "segmentName", "observedAt");
CREATE INDEX "TicketmasterEventStatusChange_previousStatus_newStatus_observedAt_idx" ON "TicketmasterEventStatusChange"("previousStatus", "newStatus", "observedAt");
CREATE INDEX "TicketmasterEventStatusChange_sourceEventId_idx" ON "TicketmasterEventStatusChange"("sourceEventId");
CREATE UNIQUE INDEX "TicketmasterSupplySnapshot_ingestionRunId_windowDays_countryCode_segmentName_key" ON "TicketmasterSupplySnapshot"("ingestionRunId", "windowDays", "countryCode", "segmentName");
CREATE INDEX "TicketmasterSupplySnapshot_countryCode_segmentName_windowDays_capturedAt_idx" ON "TicketmasterSupplySnapshot"("countryCode", "segmentName", "windowDays", "capturedAt");
CREATE INDEX "TicketmasterSupplySnapshot_capturedAt_idx" ON "TicketmasterSupplySnapshot"("capturedAt");

ALTER TABLE "TicketmasterEventStatusChange" ADD CONSTRAINT "TicketmasterEventStatusChange_ticketmasterEventId_fkey" FOREIGN KEY ("ticketmasterEventId") REFERENCES "TicketmasterEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketmasterEventStatusChange" ADD CONSTRAINT "TicketmasterEventStatusChange_ingestionRunId_fkey" FOREIGN KEY ("ingestionRunId") REFERENCES "IngestionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketmasterSupplySnapshot" ADD CONSTRAINT "TicketmasterSupplySnapshot_ingestionRunId_fkey" FOREIGN KEY ("ingestionRunId") REFERENCES "IngestionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
