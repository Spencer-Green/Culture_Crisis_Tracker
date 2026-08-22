CREATE TYPE "MediaClassificationFeedbackReason" AS ENUM (
    'WRONG_SECTOR',
    'WRONG_EVENT_TYPE',
    'WRONG_AI_TAG',
    'WRONG_IMPORTANCE',
    'NOT_RELEVANT_TO_CULTURAL_INTELLIGENCE'
);

CREATE TABLE "MediaClassificationFeedback" (
    "id" UUID NOT NULL,
    "mediaArticleId" UUID NOT NULL,
    "reasons" "MediaClassificationFeedbackReason"[] NOT NULL,
    "reviewedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MediaClassificationFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaClassificationFeedback_mediaArticleId_key"
ON "MediaClassificationFeedback"("mediaArticleId");

CREATE INDEX "MediaClassificationFeedback_reviewedAt_idx"
ON "MediaClassificationFeedback"("reviewedAt");

ALTER TABLE "MediaClassificationFeedback"
ADD CONSTRAINT "MediaClassificationFeedback_mediaArticleId_fkey"
FOREIGN KEY ("mediaArticleId") REFERENCES "MediaArticle"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
