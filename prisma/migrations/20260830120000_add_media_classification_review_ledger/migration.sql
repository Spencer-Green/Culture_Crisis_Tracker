CREATE TYPE "MediaClassificationReviewAction" AS ENUM (
    'CORRECT',
    'WRONG_CLASSIFICATION',
    'CLEAR'
);

CREATE TYPE "MediaClassificationDimensionReviewStatus" AS ENUM (
    'UNREVIEWED',
    'APPROVED',
    'CORRECTED',
    'REJECTED'
);

CREATE TABLE "MediaClassificationReviewEvent" (
    "id" UUID NOT NULL,
    "mediaArticleId" UUID NOT NULL,
    "supersedesReviewEventId" UUID,
    "action" "MediaClassificationReviewAction" NOT NULL,
    "reasons" "MediaClassificationFeedbackReason"[] NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "storyFingerprint" TEXT,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "machinePrediction" JSONB NOT NULL,
    "predictedAt" TIMESTAMPTZ(3) NOT NULL,
    "classifierVersion" TEXT NOT NULL,
    "rulesetVersion" TEXT NOT NULL,
    "taxonomyVersion" TEXT NOT NULL,
    "signalDirectionVersion" TEXT NOT NULL,
    "inputSchemaVersion" TEXT NOT NULL,
    "reviewGuidelineVersion" TEXT NOT NULL,
    "codeRevision" TEXT,
    "sectorReviewStatus" "MediaClassificationDimensionReviewStatus" NOT NULL,
    "humanSector" TEXT,
    "eventTypeReviewStatus" "MediaClassificationDimensionReviewStatus" NOT NULL,
    "humanEventType" TEXT,
    "signalDirectionReviewStatus" "MediaClassificationDimensionReviewStatus" NOT NULL,
    "humanSignalDirection" TEXT,
    "importanceReviewStatus" "MediaClassificationDimensionReviewStatus" NOT NULL,
    "humanImportance" INTEGER,
    "confidenceReviewStatus" "MediaClassificationDimensionReviewStatus" NOT NULL,
    "humanConfidence" TEXT,
    "relevanceReviewStatus" "MediaClassificationDimensionReviewStatus" NOT NULL,
    "humanRelevant" BOOLEAN,
    "legacyAiReviewStatus" "MediaClassificationDimensionReviewStatus" NOT NULL,
    "humanLegacyAiImpactType" TEXT,
    "reviewedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaClassificationReviewEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaClassificationReviewEvent_supersedesReviewEventId_key"
ON "MediaClassificationReviewEvent"("supersedesReviewEventId");

CREATE INDEX "MediaClassificationReviewEvent_mediaArticleId_createdAt_idx"
ON "MediaClassificationReviewEvent"("mediaArticleId", "createdAt");

CREATE INDEX "MediaClassificationReviewEvent_reviewedAt_idx"
ON "MediaClassificationReviewEvent"("reviewedAt");

CREATE INDEX "MediaClassificationReviewEvent_classifierVersion_taxonomyVersion_idx"
ON "MediaClassificationReviewEvent"("classifierVersion", "taxonomyVersion");

CREATE INDEX "MediaClassificationReviewEvent_contentHash_idx"
ON "MediaClassificationReviewEvent"("contentHash");

ALTER TABLE "MediaClassificationReviewEvent"
ADD CONSTRAINT "MediaClassificationReviewEvent_humanImportance_check"
CHECK (
    "humanImportance" IS NULL OR
    "humanImportance" BETWEEN 1 AND 5
);

ALTER TABLE "MediaClassificationReviewEvent"
ADD CONSTRAINT "MediaClassificationReviewEvent_humanSignalDirection_check"
CHECK (
    "humanSignalDirection" IS NULL OR
    "humanSignalDirection" IN ('POSITIVE', 'NEGATIVE', 'AMBIGUOUS')
);

ALTER TABLE "MediaClassificationReviewEvent"
ADD CONSTRAINT "MediaClassificationReviewEvent_humanConfidence_check"
CHECK (
    "humanConfidence" IS NULL OR
    "humanConfidence" IN ('low', 'medium', 'high')
);

ALTER TABLE "MediaClassificationReviewEvent"
ADD CONSTRAINT "MediaClassificationReviewEvent_mediaArticleId_fkey"
FOREIGN KEY ("mediaArticleId") REFERENCES "MediaArticle"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MediaClassificationReviewEvent"
ADD CONSTRAINT "MediaClassificationReviewEvent_supersedesReviewEventId_fkey"
FOREIGN KEY ("supersedesReviewEventId") REFERENCES "MediaClassificationReviewEvent"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
