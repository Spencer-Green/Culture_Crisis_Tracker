import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { toMediaClassificationFeedbackState } from "@/services/media/media-feedback";
import type { PersistedMediaClassificationFeedback } from "@/services/media/media-feedback-core";
import type { MediaMachineClassificationSnapshot } from "@/services/media/media-feedback-types";

const CURRENT: MediaMachineClassificationSnapshot = {
  sector: "film",
  eventType: "AI_LICENSING",
  aiTag: "RIGHTS_LICENSING",
  importance: 4,
  confidence: "high",
};

const CORRECT: PersistedMediaClassificationFeedback = {
  mediaArticleId: "article-1",
  reviewState: "CORRECT",
  reasons: [],
  correctedSector: null,
  correctedEventType: null,
  correctedAiTag: null,
  correctedImportance: null,
  approvedMachineClassification: CURRENT,
  reviewedAt: new Date("2026-08-23T01:00:00.000Z"),
};

describe("evaluation-ready media feedback state", () => {
  it("exposes the current positive approval and its machine snapshot", () => {
    expect(toMediaClassificationFeedbackState(CURRENT, CORRECT)).toEqual({
      reviewState: "CORRECT",
      reasons: [],
      correctedSector: null,
      correctedEventType: null,
      correctedAiTag: null,
      correctedImportance: null,
      approvedMachineClassification: CURRENT,
      evaluationState: "CORRECT",
      reviewedAt: "2026-08-23T01:00:00.000Z",
    });
  });

  it("distinguishes an outdated approval from current machine output", () => {
    const changed = { ...CURRENT, confidence: "medium" as const };
    expect(
      toMediaClassificationFeedbackState(changed, CORRECT).evaluationState,
    ).toBe("REVIEW_OUTDATED");
    expect(CORRECT.approvedMachineClassification).toEqual(CURRENT);
  });

  it("keeps wrong feedback and corrections evaluation-ready", () => {
    const wrong: PersistedMediaClassificationFeedback = {
      ...CORRECT,
      reviewState: "WRONG_CLASSIFICATION",
      reasons: ["WRONG_EVENT_TYPE"],
      correctedEventType: "INVESTMENT",
      approvedMachineClassification: null,
    };
    expect(toMediaClassificationFeedbackState(CURRENT, wrong)).toMatchObject({
      reviewState: "WRONG_CLASSIFICATION",
      evaluationState: "WRONG_CLASSIFICATION",
      reasons: ["WRONG_EVENT_TYPE"],
      correctedEventType: "INVESTMENT",
      approvedMachineClassification: null,
    });
  });
});
