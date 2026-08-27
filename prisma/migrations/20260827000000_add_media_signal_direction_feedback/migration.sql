ALTER TYPE "MediaClassificationFeedbackReason"
ADD VALUE 'WRONG_SIGNAL_DIRECTION';

ALTER TABLE "MediaClassificationFeedback"
ADD COLUMN "correctedSignalDirection" TEXT,
ADD COLUMN "approvedSignalDirection" TEXT;

ALTER TABLE "MediaClassificationFeedback"
ADD CONSTRAINT "MediaClassificationFeedback_correctedSignalDirection_check"
CHECK (
    "correctedSignalDirection" IS NULL OR
    "correctedSignalDirection" IN ('POSITIVE', 'NEGATIVE', 'AMBIGUOUS')
),
ADD CONSTRAINT "MediaClassificationFeedback_approvedSignalDirection_check"
CHECK (
    "approvedSignalDirection" IS NULL OR
    "approvedSignalDirection" IN ('POSITIVE', 'NEGATIVE', 'AMBIGUOUS')
);

ALTER TABLE "MediaClassificationFeedback"
DROP CONSTRAINT "MediaClassificationFeedback_reviewState_check";

ALTER TABLE "MediaClassificationFeedback"
ADD CONSTRAINT "MediaClassificationFeedback_reviewState_check"
CHECK (
    (
        "reviewState" = 'WRONG_CLASSIFICATION' AND
        cardinality("reasons") > 0 AND
        "approvedSector" IS NULL AND
        "approvedEventType" IS NULL AND
        "approvedAiTag" IS NULL AND
        "approvedSignalDirection" IS NULL AND
        "approvedImportance" IS NULL AND
        "approvedConfidence" IS NULL
    ) OR
    (
        "reviewState" = 'CORRECT' AND
        cardinality("reasons") = 0 AND
        "correctedSector" IS NULL AND
        "correctedEventType" IS NULL AND
        "correctedAiTag" IS NULL AND
        "correctedSignalDirection" IS NULL AND
        "correctedImportance" IS NULL AND
        "approvedSector" IS NOT NULL AND
        "approvedImportance" IS NOT NULL AND
        "approvedConfidence" IS NOT NULL
    )
);
