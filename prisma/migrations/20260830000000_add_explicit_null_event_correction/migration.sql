ALTER TABLE "MediaClassificationFeedback"
ADD COLUMN "correctedEventTypeToNull" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "MediaClassificationFeedback"
ADD CONSTRAINT "MediaClassificationFeedback_event_type_correction_check"
CHECK (
    NOT ("correctedEventTypeToNull" AND "correctedEventType" IS NOT NULL) AND
    (
        NOT "correctedEventTypeToNull" OR
        'WRONG_EVENT_TYPE'::"MediaClassificationFeedbackReason" = ANY("reasons")
    )
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
        NOT "correctedEventTypeToNull" AND
        "correctedAiTag" IS NULL AND
        "correctedSignalDirection" IS NULL AND
        "correctedImportance" IS NULL AND
        "approvedSector" IS NOT NULL AND
        "approvedImportance" IS NOT NULL AND
        "approvedConfidence" IS NOT NULL
    )
);
