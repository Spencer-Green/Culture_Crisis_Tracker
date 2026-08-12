CREATE TABLE "TicketmasterVenue" (
    "id" UUID NOT NULL,
    "ticketmasterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "region" TEXT,
    "countryCode" VARCHAR(3) NOT NULL,
    "timezone" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "TicketmasterVenue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TicketmasterEvent" (
    "id" UUID NOT NULL,
    "ticketmasterId" TEXT NOT NULL,
    "sourceId" UUID NOT NULL,
    "venueId" UUID,
    "name" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourcePlatform" TEXT NOT NULL,
    "countryCode" VARCHAR(3) NOT NULL,
    "sectorSlug" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "localTime" TEXT,
    "eventDateTime" TIMESTAMPTZ(3),
    "timezone" TEXT,
    "status" TEXT NOT NULL,
    "previousStatus" TEXT,
    "statusChangedAt" TIMESTAMPTZ(3),
    "segmentId" TEXT NOT NULL,
    "segmentName" TEXT NOT NULL,
    "genreId" TEXT,
    "genreName" TEXT,
    "subGenreId" TEXT,
    "subGenreName" TEXT,
    "promoterId" TEXT,
    "promoterName" TEXT,
    "publicOnsaleStartAt" TIMESTAMPTZ(3),
    "publicOnsaleEndAt" TIMESTAMPTZ(3),
    "priceMin" DECIMAL(12,2),
    "priceMax" DECIMAL(12,2),
    "priceCurrency" VARCHAR(3),
    "priceType" TEXT,
    "locale" TEXT,
    "testEvent" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "retrievedAt" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "TicketmasterEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TicketmasterVenue_ticketmasterId_key" ON "TicketmasterVenue"("ticketmasterId");
CREATE INDEX "TicketmasterVenue_countryCode_city_idx" ON "TicketmasterVenue"("countryCode", "city");
CREATE UNIQUE INDEX "TicketmasterEvent_ticketmasterId_key" ON "TicketmasterEvent"("ticketmasterId");
CREATE INDEX "TicketmasterEvent_eventDateTime_idx" ON "TicketmasterEvent"("eventDateTime");
CREATE INDEX "TicketmasterEvent_countryCode_sectorSlug_eventDateTime_idx" ON "TicketmasterEvent"("countryCode", "sectorSlug", "eventDateTime");
CREATE INDEX "TicketmasterEvent_status_idx" ON "TicketmasterEvent"("status");
CREATE INDEX "TicketmasterEvent_venueId_idx" ON "TicketmasterEvent"("venueId");
CREATE INDEX "TicketmasterEvent_sourceId_idx" ON "TicketmasterEvent"("sourceId");

ALTER TABLE "TicketmasterVenue" ADD CONSTRAINT "TicketmasterVenue_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketmasterEvent" ADD CONSTRAINT "TicketmasterEvent_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketmasterEvent" ADD CONSTRAINT "TicketmasterEvent_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "TicketmasterVenue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TicketmasterEvent" ADD CONSTRAINT "TicketmasterEvent_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketmasterEvent" ADD CONSTRAINT "TicketmasterEvent_sectorSlug_fkey" FOREIGN KEY ("sectorSlug") REFERENCES "Sector"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
