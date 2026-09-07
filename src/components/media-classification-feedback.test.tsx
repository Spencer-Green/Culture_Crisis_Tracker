import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  MEDIA_EVENT_CORRECTION_OPTIONS,
  MediaClassificationFeedback,
} from "@/components/media-classification-feedback";
import {
  MEDIA_CLASSIFICATION_FEEDBACK_LABELS,
  MEDIA_CLASSIFICATION_FEEDBACK_UI_REASONS,
  type MediaClassificationFeedbackState,
} from "@/services/media/media-feedback-types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const SNAPSHOT = {
  sector: "music" as const,
  eventType: "INVESTMENT" as const,
  aiTag: null,
  signalDirection: "POSITIVE" as const,
  importance: 4 as const,
  confidence: "high" as const,
};

function correctFeedback(
  evaluationState: "CORRECT" | "REVIEW_OUTDATED" = "CORRECT",
): MediaClassificationFeedbackState {
  return {
    reviewState: "CORRECT",
    reasons: [],
    correctedSector: null,
    correctedEventType: null,
    correctedAiTag: null,
    correctedSignalDirection: null,
    correctedImportance: null,
    approvedMachineClassification: SNAPSHOT,
    evaluationState,
    reviewedAt: "2026-08-23T01:00:00.000Z",
  };
}

describe("MediaClassificationFeedback", () => {
  it("replaces the visible legacy AI-tag correction with signal direction", () => {
    expect(MEDIA_CLASSIFICATION_FEEDBACK_UI_REASONS).toContain(
      "WRONG_SIGNAL_DIRECTION",
    );
    expect(MEDIA_CLASSIFICATION_FEEDBACK_UI_REASONS).not.toContain(
      "WRONG_AI_TAG",
    );
    expect(MEDIA_CLASSIFICATION_FEEDBACK_LABELS.WRONG_SIGNAL_DIRECTION).toBe(
      "Wrong signal direction",
    );
  });

  it("offers explicit correct and wrong actions for unreviewed articles", () => {
    const html = renderToStaticMarkup(
      <MediaClassificationFeedback
        articleId="article-1"
        initialFeedback={null}
      />,
    );
    expect(html).toContain("✓ Correct");
    expect(html).toContain("Wrong classification");
  });

  it("shows a compact verified state with change and clear actions", () => {
    const html = renderToStaticMarkup(
      <MediaClassificationFeedback
        articleId="article-1"
        initialFeedback={correctFeedback()}
      />,
    );
    expect(html).toContain("✓ Classification verified");
    expect(html).toContain("Change review");
    expect(html).toContain("Clear");
  });

  it("surfaces positive-review drift without discarding the review", () => {
    const html = renderToStaticMarkup(
      <MediaClassificationFeedback
        articleId="article-1"
        initialFeedback={correctFeedback("REVIEW_OUTDATED")}
      />,
    );
    expect(html).toContain("Review outdated");
    expect(html).toContain("✓ Verify current");
  });

  it("retains the compact wrong-classification presentation", () => {
    const feedback: MediaClassificationFeedbackState = {
      reviewState: "WRONG_CLASSIFICATION",
      reasons: ["WRONG_EVENT_TYPE"],
      correctedSector: null,
      correctedEventType: "EXPANSION",
      correctedAiTag: null,
      correctedSignalDirection: null,
      correctedImportance: null,
      approvedMachineClassification: null,
      evaluationState: "WRONG_CLASSIFICATION",
      reviewedAt: "2026-08-23T01:00:00.000Z",
    };
    const html = renderToStaticMarkup(
      <MediaClassificationFeedback
        articleId="article-1"
        initialFeedback={feedback}
      />,
    );
    expect(html).toContain("Classification flagged");
    expect(html).toContain("✓ Mark correct");
  });

  it("offers an explicit no-material-event correction", () => {
    expect(MEDIA_EVENT_CORRECTION_OPTIONS[0]).toEqual({
      value: "__NO_MATERIAL_EVENT__",
      label: "No material event / none",
    });
  });
});
