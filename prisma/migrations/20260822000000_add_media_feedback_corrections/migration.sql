ALTER TABLE "MediaClassificationFeedback"
ADD COLUMN "correctedSector" TEXT,
ADD COLUMN "correctedEventType" TEXT,
ADD COLUMN "correctedAiTag" TEXT,
ADD COLUMN "correctedImportance" INTEGER;

ALTER TABLE "MediaClassificationFeedback"
ADD CONSTRAINT "MediaClassificationFeedback_correctedImportance_check"
CHECK (
    "correctedImportance" IS NULL OR
    "correctedImportance" BETWEEN 1 AND 5
);
