export const MEDIA_CLASSIFIER_VERSION = "media-classifier-v1";
export const MEDIA_CLASSIFICATION_RULESET_VERSION = "media-ruleset-v1";
export const MEDIA_CLASSIFICATION_TAXONOMY_VERSION = "media-taxonomy-v1";
export const MEDIA_SIGNAL_DIRECTION_VERSION = "signal-direction-v1";
export const MEDIA_CLASSIFICATION_INPUT_SCHEMA_VERSION =
  "media-classification-input-v1";
export const MEDIA_CLASSIFICATION_REVIEW_GUIDELINE_VERSION =
  "media-review-guidelines-v1";

export function mediaClassificationCodeRevision(): string | null {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.GIT_COMMIT_SHA?.trim() ||
    null
  );
}
