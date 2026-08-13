CREATE TABLE "MediaArticle" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "sourceType" TEXT NOT NULL,
    "externalId" TEXT,
    "canonicalUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "publisher" TEXT NOT NULL,
    "sourceDomain" TEXT NOT NULL,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL,
    "retrievedAt" TIMESTAMPTZ(3) NOT NULL,
    "language" TEXT,
    "countryCode" VARCHAR(3),
    "sectorSlug" TEXT,
    "eventType" TEXT,
    "polarity" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "importance" INTEGER NOT NULL,
    "aiImpactType" TEXT,
    "reviewState" TEXT NOT NULL,
    "classificationRationale" TEXT NOT NULL,
    "storyFingerprint" TEXT,
    "possibleDuplicateStory" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "MediaArticle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MediaArticleSourceMatch" (
    "id" UUID NOT NULL,
    "matchKey" TEXT NOT NULL,
    "mediaArticleId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "sourceType" TEXT NOT NULL,
    "externalId" TEXT,
    "queryFamily" TEXT,
    "feedSlug" TEXT,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "MediaArticleSourceMatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaArticle_canonicalUrl_key" ON "MediaArticle"("canonicalUrl");
CREATE INDEX "MediaArticle_publishedAt_idx" ON "MediaArticle"("publishedAt");
CREATE INDEX "MediaArticle_sectorSlug_publishedAt_idx" ON "MediaArticle"("sectorSlug", "publishedAt");
CREATE INDEX "MediaArticle_eventType_publishedAt_idx" ON "MediaArticle"("eventType", "publishedAt");
CREATE INDEX "MediaArticle_polarity_importance_publishedAt_idx" ON "MediaArticle"("polarity", "importance", "publishedAt");
CREATE INDEX "MediaArticle_aiImpactType_publishedAt_idx" ON "MediaArticle"("aiImpactType", "publishedAt");
CREATE INDEX "MediaArticle_countryCode_publishedAt_idx" ON "MediaArticle"("countryCode", "publishedAt");
CREATE INDEX "MediaArticle_storyFingerprint_publishedAt_idx" ON "MediaArticle"("storyFingerprint", "publishedAt");
CREATE INDEX "MediaArticle_sourceId_idx" ON "MediaArticle"("sourceId");
CREATE UNIQUE INDEX "MediaArticleSourceMatch_matchKey_key" ON "MediaArticleSourceMatch"("matchKey");
CREATE INDEX "MediaArticleSourceMatch_mediaArticleId_idx" ON "MediaArticleSourceMatch"("mediaArticleId");
CREATE INDEX "MediaArticleSourceMatch_sourceId_sourceType_idx" ON "MediaArticleSourceMatch"("sourceId", "sourceType");
CREATE INDEX "MediaArticleSourceMatch_feedSlug_idx" ON "MediaArticleSourceMatch"("feedSlug");
CREATE INDEX "MediaArticleSourceMatch_queryFamily_idx" ON "MediaArticleSourceMatch"("queryFamily");

ALTER TABLE "MediaArticle" ADD CONSTRAINT "MediaArticle_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MediaArticle" ADD CONSTRAINT "MediaArticle_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MediaArticle" ADD CONSTRAINT "MediaArticle_sectorSlug_fkey" FOREIGN KEY ("sectorSlug") REFERENCES "Sector"("slug") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MediaArticleSourceMatch" ADD CONSTRAINT "MediaArticleSourceMatch_mediaArticleId_fkey" FOREIGN KEY ("mediaArticleId") REFERENCES "MediaArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaArticleSourceMatch" ADD CONSTRAINT "MediaArticleSourceMatch_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
