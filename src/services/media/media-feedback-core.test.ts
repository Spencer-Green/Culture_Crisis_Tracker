import { describe, expect, it } from "vitest";

import {
  InvalidMediaClassificationFeedbackError,
  MediaArticleNotFoundError,
  mediaClassificationEvaluationState,
  setMediaClassificationFeedback,
  type MediaClassificationFeedbackStore,
  type PersistedMediaClassificationFeedback,
} from "@/services/media/media-feedback-core";
import {
  MEDIA_CLASSIFICATION_FEEDBACK_REASONS,
  type MediaClassificationCorrections,
  type MediaClassificationFeedbackReason,
  type MediaMachineClassificationSnapshot,
  type PersistedMediaClassificationReviewState,
} from "@/services/media/media-feedback-types";

const MACHINE: MediaMachineClassificationSnapshot = {
  sector: "music",
  eventType: "BANKRUPTCY_INSOLVENCY",
  aiTag: null,
  signalDirection: "NEGATIVE",
  importance: 3,
  confidence: "high",
};

const EMPTY_CORRECTIONS: MediaClassificationCorrections = {
  correctedSector: null,
  correctedEventType: null,
  correctedAiTag: null,
  correctedSignalDirection: null,
  correctedImportance: null,
};

class InMemoryFeedbackStore implements MediaClassificationFeedbackStore {
  machineClassification = { ...MACHINE };
  feedback: PersistedMediaClassificationFeedback | null = null;
  upsertCount = 0;
  deleteCount = 0;

  async findArticle(articleId: string) {
    if (articleId !== "article-1") return null;
    return {
      id: articleId,
      machineClassification: this.machineClassification,
      classificationFeedback: this.feedback,
    };
  }

  async upsertFeedback(input: {
    articleId: string;
    reviewState: PersistedMediaClassificationReviewState;
    reasons: MediaClassificationFeedbackReason[];
    corrections: MediaClassificationCorrections;
    approvedMachineClassification: MediaMachineClassificationSnapshot | null;
    reviewedAt: Date;
  }) {
    this.upsertCount += 1;
    this.feedback = {
      mediaArticleId: input.articleId,
      reviewState: input.reviewState,
      reasons: [...input.reasons],
      ...input.corrections,
      approvedMachineClassification: input.approvedMachineClassification
        ? { ...input.approvedMachineClassification }
        : null,
      reviewedAt: input.reviewedAt,
    };
    return this.feedback;
  }

  async deleteFeedback() {
    this.deleteCount += 1;
    this.feedback = null;
  }
}

const firstReview = new Date("2026-08-17T08:00:00Z");
const secondReview = new Date("2026-08-17T09:00:00Z");

async function saveCorrect(
  store: InMemoryFeedbackStore,
  reviewedAt = firstReview,
) {
  return setMediaClassificationFeedback(store, {
    articleId: "article-1",
    reviewState: "CORRECT",
    reasons: [],
    reviewedAt,
  });
}

async function saveWrong(
  store: InMemoryFeedbackStore,
  reasons: MediaClassificationFeedbackReason[] = ["WRONG_EVENT_TYPE"],
  corrections: Partial<MediaClassificationCorrections> = {},
  reviewedAt = firstReview,
) {
  return setMediaClassificationFeedback(store, {
    articleId: "article-1",
    reviewState: "WRONG_CLASSIFICATION",
    reasons,
    corrections,
    reviewedAt,
  });
}

describe("media classification review states", () => {
  it("represents an article without feedback as unreviewed", () => {
    expect(mediaClassificationEvaluationState(MACHINE, null)).toBe(
      "UNREVIEWED",
    );
  });

  it("saves CORRECT with the reviewed machine snapshot", async () => {
    const store = new InMemoryFeedbackStore();
    const feedback = await saveCorrect(store);

    expect(feedback).toEqual({
      mediaArticleId: "article-1",
      reviewState: "CORRECT",
      reasons: [],
      ...EMPTY_CORRECTIONS,
      approvedMachineClassification: MACHINE,
      reviewedAt: firstReview,
    });
    expect(mediaClassificationEvaluationState(MACHINE, feedback)).toBe(
      "CORRECT",
    );
  });

  it("saves an identical CORRECT review idempotently", async () => {
    const store = new InMemoryFeedbackStore();
    const first = await saveCorrect(store);
    const repeated = await saveCorrect(store, secondReview);

    expect(repeated).toEqual(first);
    expect(repeated?.reviewedAt).toEqual(firstReview);
    expect(store.upsertCount).toBe(1);
  });

  it.each(MEDIA_CLASSIFICATION_FEEDBACK_REASONS)(
    "preserves existing %s wrong feedback",
    async (reason) => {
      const store = new InMemoryFeedbackStore();
      const feedback = await saveWrong(store, [reason]);

      expect(feedback).toMatchObject({
        reviewState: "WRONG_CLASSIFICATION",
        reasons: [reason],
        ...EMPTY_CORRECTIONS,
        approvedMachineClassification: null,
      });
    },
  );

  it("allows wrong feedback without a correction and multiple corrected reasons", async () => {
    const store = new InMemoryFeedbackStore();
    const withoutCorrection = await saveWrong(store);
    expect(withoutCorrection).toMatchObject(EMPTY_CORRECTIONS);

    const corrected = await saveWrong(
      store,
      ["WRONG_SECTOR", "WRONG_EVENT_TYPE", "WRONG_AI_TAG", "WRONG_IMPORTANCE"],
      {
        correctedSector: "gaming",
        correctedEventType: "LAYOFFS",
        correctedAiTag: "LABOR_DISPLACEMENT",
        correctedSignalDirection: null,
        correctedImportance: 5,
      },
      secondReview,
    );
    expect(corrected).toMatchObject({
      correctedSector: "gaming",
      correctedEventType: "LAYOFFS",
      correctedAiTag: "LABOR_DISPLACEMENT",
      correctedSignalDirection: null,
      correctedImportance: 5,
    });
  });

  it("switches CORRECT to WRONG and removes the approval snapshot", async () => {
    const store = new InMemoryFeedbackStore();
    await saveCorrect(store);
    const feedback = await saveWrong(
      store,
      ["WRONG_IMPORTANCE"],
      { correctedImportance: 2 },
      secondReview,
    );

    expect(feedback).toMatchObject({
      reviewState: "WRONG_CLASSIFICATION",
      reasons: ["WRONG_IMPORTANCE"],
      correctedImportance: 2,
      approvedMachineClassification: null,
    });
  });

  it("switches WRONG to CORRECT and clears reasons, corrections, and NOT_RELEVANT", async () => {
    const store = new InMemoryFeedbackStore();
    await saveWrong(
      store,
      ["WRONG_SECTOR", "NOT_RELEVANT_TO_CULTURAL_INTELLIGENCE"],
      { correctedSector: "film" },
    );

    const feedback = await saveCorrect(store, secondReview);
    expect(feedback).toEqual({
      mediaArticleId: "article-1",
      reviewState: "CORRECT",
      reasons: [],
      ...EMPTY_CORRECTIONS,
      approvedMachineClassification: MACHINE,
      reviewedAt: secondReview,
    });
  });

  it.each(["CORRECT", "WRONG_CLASSIFICATION"] as const)(
    "clears %s to unreviewed idempotently",
    async (state) => {
      const store = new InMemoryFeedbackStore();
      if (state === "CORRECT") await saveCorrect(store);
      else await saveWrong(store);

      expect(
        await setMediaClassificationFeedback(store, {
          articleId: "article-1",
          reviewState: "UNREVIEWED",
          reasons: [],
          reviewedAt: secondReview,
        }),
      ).toBeNull();
      await setMediaClassificationFeedback(store, {
        articleId: "article-1",
        reviewState: "UNREVIEWED",
        reasons: [],
        reviewedAt: secondReview,
      });
      expect(store.deleteCount).toBe(1);
      expect(mediaClassificationEvaluationState(MACHINE, store.feedback)).toBe(
        "UNREVIEWED",
      );
    },
  );

  it("does not mutate machine classification during any transition", async () => {
    const store = new InMemoryFeedbackStore();
    const original = { ...store.machineClassification };
    await saveWrong(store, ["WRONG_SECTOR"], { correctedSector: "film" });
    await saveCorrect(store, secondReview);
    expect(store.machineClassification).toEqual(original);
  });

  it("detects classifier drift without deleting the historical approval", async () => {
    const store = new InMemoryFeedbackStore();
    const approval = await saveCorrect(store);
    store.machineClassification = { ...MACHINE, importance: 4 };

    expect(
      mediaClassificationEvaluationState(store.machineClassification, approval),
    ).toBe("REVIEW_OUTDATED");
    expect(approval?.approvedMachineClassification).toEqual(MACHINE);
  });

  it("clears corrections whose associated wrong reason is removed", async () => {
    const store = new InMemoryFeedbackStore();
    await saveWrong(store, ["WRONG_SECTOR", "WRONG_EVENT_TYPE"], {
      correctedSector: "film",
      correctedEventType: "CLOSURE",
    });
    const changed = await saveWrong(
      store,
      ["WRONG_EVENT_TYPE"],
      { correctedSector: "film", correctedEventType: "CLOSURE" },
      secondReview,
    );
    expect(changed).toMatchObject({
      correctedSector: null,
      correctedEventType: "CLOSURE",
    });
  });

  it("persists and clears a human signal-direction correction", async () => {
    const store = new InMemoryFeedbackStore();
    const corrected = await saveWrong(store, ["WRONG_SIGNAL_DIRECTION"], {
      correctedSignalDirection: "AMBIGUOUS",
    });
    expect(corrected?.correctedSignalDirection).toBe("AMBIGUOUS");

    const retainedFlag = await saveWrong(
      store,
      ["WRONG_SIGNAL_DIRECTION"],
      { correctedSignalDirection: null },
      secondReview,
    );
    expect(retainedFlag).toMatchObject({
      reasons: ["WRONG_SIGNAL_DIRECTION"],
      correctedSignalDirection: null,
    });

    const removed = await saveWrong(
      store,
      ["WRONG_EVENT_TYPE"],
      { correctedSignalDirection: "POSITIVE" },
      new Date("2026-08-17T10:00:00Z"),
    );
    expect(removed?.correctedSignalDirection).toBeNull();
  });

  it("detects signal drift while preserving legacy positive snapshots", () => {
    const current = { ...MACHINE, signalDirection: "POSITIVE" as const };
    const changed = { ...MACHINE, signalDirection: "AMBIGUOUS" as const };
    const currentApproval: PersistedMediaClassificationFeedback = {
      mediaArticleId: "article-1",
      reviewState: "CORRECT",
      reasons: [],
      ...EMPTY_CORRECTIONS,
      approvedMachineClassification: current,
      reviewedAt: firstReview,
    };
    expect(mediaClassificationEvaluationState(changed, currentApproval)).toBe(
      "REVIEW_OUTDATED",
    );

    const legacyApproval = {
      ...currentApproval,
      approvedMachineClassification: { ...MACHINE, signalDirection: null },
    };
    expect(mediaClassificationEvaluationState(current, legacyApproval)).toBe(
      "CORRECT",
    );
  });

  it("rejects invalid transitions, values, and missing articles", async () => {
    const store = new InMemoryFeedbackStore();
    await expect(
      setMediaClassificationFeedback(store, {
        articleId: "article-1",
        reviewState: "WRONG_CLASSIFICATION",
        reasons: [],
        reviewedAt: firstReview,
      }),
    ).rejects.toBeInstanceOf(InvalidMediaClassificationFeedbackError);
    await expect(
      setMediaClassificationFeedback(store, {
        articleId: "article-1",
        reviewState: "WRONG_CLASSIFICATION",
        reasons: ["WRONG_IMPORTANCE"],
        corrections: { correctedImportance: 6 },
        reviewedAt: firstReview,
      }),
    ).rejects.toBeInstanceOf(InvalidMediaClassificationFeedbackError);
    await expect(
      setMediaClassificationFeedback(store, {
        articleId: "missing",
        reviewState: "CORRECT",
        reasons: [],
        reviewedAt: firstReview,
      }),
    ).rejects.toBeInstanceOf(MediaArticleNotFoundError);
  });
});
