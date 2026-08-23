CREATE TYPE "MediaClassificationReviewState" AS ENUM (
    'CORRECT',
    'WRONG_CLASSIFICATION'
);

ALTER TABLE "MediaClassificationFeedback"
ADD COLUMN "reviewState" "MediaClassificationReviewState",
ADD COLUMN "approvedSector" TEXT,
ADD COLUMN "approvedEventType" TEXT,
ADD COLUMN "approvedAiTag" TEXT,
ADD COLUMN "approvedImportance" INTEGER,
ADD COLUMN "approvedConfidence" TEXT;

UPDATE "MediaClassificationFeedback"
SET "reviewState" = 'WRONG_CLASSIFICATION';

ALTER TABLE "MediaClassificationFeedback"
ALTER COLUMN "reviewState" SET NOT NULL;

ALTER TABLE "MediaClassificationFeedback"
ADD CONSTRAINT "MediaClassificationFeedback_approvedImportance_check"
CHECK (
    "approvedImportance" IS NULL OR
    "approvedImportance" BETWEEN 1 AND 5
),
ADD CONSTRAINT "MediaClassificationFeedback_approvedConfidence_check"
CHECK (
    "approvedConfidence" IS NULL OR
    "approvedConfidence" IN ('low', 'medium', 'high')
),
ADD CONSTRAINT "MediaClassificationFeedback_reviewState_check"
CHECK (
    (
        "reviewState" = 'WRONG_CLASSIFICATION' AND
        cardinality("reasons") > 0 AND
        "approvedSector" IS NULL AND
        "approvedEventType" IS NULL AND
        "approvedAiTag" IS NULL AND
        "approvedImportance" IS NULL AND
        "approvedConfidence" IS NULL
    ) OR
    (
        "reviewState" = 'CORRECT' AND
        cardinality("reasons") = 0 AND
        "correctedSector" IS NULL AND
        "correctedEventType" IS NULL AND
        "correctedAiTag" IS NULL AND
        "correctedImportance" IS NULL AND
        "approvedSector" IS NOT NULL AND
        "approvedImportance" IS NOT NULL AND
        "approvedConfidence" IS NOT NULL
    )
);

CREATE INDEX "MediaClassificationFeedback_reviewState_reviewedAt_idx"
ON "MediaClassificationFeedback"("reviewState", "reviewedAt");
