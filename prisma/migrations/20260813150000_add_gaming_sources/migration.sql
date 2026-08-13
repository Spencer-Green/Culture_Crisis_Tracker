CREATE TABLE "Game" (
    "id" UUID NOT NULL,
    "igdbId" INTEGER NOT NULL,
    "sourceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "firstReleaseDate" TIMESTAMPTZ(3),
    "gameTypeId" INTEGER NOT NULL,
    "gameTypeName" TEXT NOT NULL,
    "gameStatusId" INTEGER,
    "gameStatusName" TEXT,
    "parentIgdbId" INTEGER,
    "versionParentIgdbId" INTEGER,
    "steamAppId" INTEGER,
    "igdbCreatedAt" TIMESTAMPTZ(3),
    "igdbUpdatedAt" TIMESTAMPTZ(3),
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "retrievedAt" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GameCompany" (
    "id" UUID NOT NULL,
    "igdbId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "GameCompany_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GameCompanyRole" (
    "id" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "developer" BOOLEAN NOT NULL DEFAULT false,
    "publisher" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "GameCompanyRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GameGenre" (
    "id" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "igdbGenreId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GameGenre_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GamePlatform" (
    "id" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "igdbPlatformId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GamePlatform_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GameRelease" (
    "id" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "igdbReleaseDateId" INTEGER NOT NULL,
    "releaseDate" TIMESTAMPTZ(3),
    "dateCategory" INTEGER,
    "regionId" INTEGER,
    "platformIgdbId" INTEGER,
    "platformName" TEXT,
    "statusId" INTEGER,
    "statusName" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "GameRelease_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GameExternalId" (
    "id" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "category" INTEGER NOT NULL,
    "uid" TEXT NOT NULL,
    "name" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "GameExternalId_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SteamGameSnapshot" (
    "id" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "ingestionRunId" UUID NOT NULL,
    "steamAppId" INTEGER NOT NULL,
    "capturedAt" TIMESTAMPTZ(3) NOT NULL,
    "retrievedAt" TIMESTAMPTZ(3) NOT NULL,
    "storeAvailable" BOOLEAN NOT NULL,
    "currentPlayers" INTEGER,
    "totalReviews" INTEGER,
    "positiveReviews" INTEGER,
    "positivePercent" DECIMAL(7,4),
    "reviewScore" INTEGER,
    "reviewScoreLabel" TEXT,
    "currentPrice" INTEGER,
    "originalPrice" INTEGER,
    "discountPercent" INTEGER,
    "currency" VARCHAR(3),
    "freeToPlay" BOOLEAN,
    "storeReleaseDate" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "SteamGameSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Game_igdbId_key" ON "Game"("igdbId");
CREATE INDEX "Game_firstReleaseDate_idx" ON "Game"("firstReleaseDate");
CREATE INDEX "Game_gameTypeId_idx" ON "Game"("gameTypeId");
CREATE INDEX "Game_gameStatusId_idx" ON "Game"("gameStatusId");
CREATE INDEX "Game_sourceId_idx" ON "Game"("sourceId");
CREATE INDEX "Game_steamAppId_idx" ON "Game"("steamAppId");
CREATE UNIQUE INDEX "GameCompany_igdbId_key" ON "GameCompany"("igdbId");
CREATE INDEX "GameCompany_name_idx" ON "GameCompany"("name");
CREATE UNIQUE INDEX "GameCompanyRole_gameId_companyId_key" ON "GameCompanyRole"("gameId", "companyId");
CREATE INDEX "GameCompanyRole_companyId_developer_publisher_idx" ON "GameCompanyRole"("companyId", "developer", "publisher");
CREATE UNIQUE INDEX "GameGenre_gameId_igdbGenreId_key" ON "GameGenre"("gameId", "igdbGenreId");
CREATE INDEX "GameGenre_igdbGenreId_name_idx" ON "GameGenre"("igdbGenreId", "name");
CREATE UNIQUE INDEX "GamePlatform_gameId_igdbPlatformId_key" ON "GamePlatform"("gameId", "igdbPlatformId");
CREATE INDEX "GamePlatform_igdbPlatformId_name_idx" ON "GamePlatform"("igdbPlatformId", "name");
CREATE UNIQUE INDEX "GameRelease_igdbReleaseDateId_key" ON "GameRelease"("igdbReleaseDateId");
CREATE INDEX "GameRelease_gameId_releaseDate_idx" ON "GameRelease"("gameId", "releaseDate");
CREATE INDEX "GameRelease_platformIgdbId_releaseDate_idx" ON "GameRelease"("platformIgdbId", "releaseDate");
CREATE UNIQUE INDEX "GameExternalId_gameId_category_uid_key" ON "GameExternalId"("gameId", "category", "uid");
CREATE INDEX "GameExternalId_gameId_category_idx" ON "GameExternalId"("gameId", "category");
CREATE UNIQUE INDEX "SteamGameSnapshot_gameId_capturedAt_key" ON "SteamGameSnapshot"("gameId", "capturedAt");
CREATE INDEX "SteamGameSnapshot_capturedAt_idx" ON "SteamGameSnapshot"("capturedAt");
CREATE INDEX "SteamGameSnapshot_steamAppId_capturedAt_idx" ON "SteamGameSnapshot"("steamAppId", "capturedAt");
CREATE INDEX "SteamGameSnapshot_sourceId_idx" ON "SteamGameSnapshot"("sourceId");
CREATE INDEX "SteamGameSnapshot_ingestionRunId_idx" ON "SteamGameSnapshot"("ingestionRunId");

ALTER TABLE "Game" ADD CONSTRAINT "Game_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GameCompanyRole" ADD CONSTRAINT "GameCompanyRole_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameCompanyRole" ADD CONSTRAINT "GameCompanyRole_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "GameCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameGenre" ADD CONSTRAINT "GameGenre_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GamePlatform" ADD CONSTRAINT "GamePlatform_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameRelease" ADD CONSTRAINT "GameRelease_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameExternalId" ADD CONSTRAINT "GameExternalId_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SteamGameSnapshot" ADD CONSTRAINT "SteamGameSnapshot_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SteamGameSnapshot" ADD CONSTRAINT "SteamGameSnapshot_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SteamGameSnapshot" ADD CONSTRAINT "SteamGameSnapshot_ingestionRunId_fkey" FOREIGN KEY ("ingestionRunId") REFERENCES "IngestionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
