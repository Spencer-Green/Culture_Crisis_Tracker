import { describe, expect, it } from "vitest";

import {
  InvalidMediaClassificationFeedbackError,
  MediaArticleNotFoundError,
  setMediaClassificationFeedback,
  type MediaClassificationFeedbackStore,
  type PersistedMediaClassificationFeedback,
} from "@/services/media/media-feedback-core";
import {
  type MediaClassificationCorrections,
  MEDIA_CLASSIFICATION_FEEDBACK_REASONS,
  type MediaClassificationFeedbackReason,
} from "@/services/media/media-feedback-types";

const EMPTY_CORRECTIONS: MediaClassificationCorrections = {
  correctedSector: null,
  correctedEventType: null,
  correctedAiTag: null,
  correctedImportance: null,
};

class InMemoryFeedbackStore implements MediaClassificationFeedbackStore {
  readonly machineClassification = {
    sectorSlug: "music",
    eventType: "BANKRUPTCY_INSOLVENCY",
    aiImpactType: null,
    importance: 3,
  };
  feedback: PersistedMediaClassificationFeedback | null = null;
  upsertCount = 0;
  deleteCount = 0;

  async findArticle(articleId: string) {
    if (articleId !== "article-1") return null;
    return { id: articleId, classificationFeedback: this.feedback };
  }

  async upsertFeedback(input: {
    articleId: string;
    reasons: MediaClassificationFeedbackReason[];
    corrections: MediaClassificationCorrections;
    reviewedAt: Date;
  }) {
    this.upsertCount += 1;
    this.feedback = {
      mediaArticleId: input.articleId,
      reasons: [...input.reasons],
      ...input.corrections,
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

const correctionCases = [
  {
    reason: "WRONG_SECTOR" as const,
    corrections: { correctedSector: "film" },
    field: "correctedSector" as const,
    value: "film",
  },
  {
    reason: "WRONG_EVENT_TYPE" as const,
    corrections: { correctedEventType: "CLOSURE" },
    field: "correctedEventType" as const,
    value: "CLOSURE",
  },
  {
    reason: "WRONG_AI_TAG" as const,
    corrections: { correctedAiTag: "RIGHTS_LICENSING" },
    field: "correctedAiTag" as const,
    value: "RIGHTS_LICENSING",
  },
  {
    reason: "WRONG_IMPORTANCE" as const,
    corrections: { correctedImportance: 5 },
    field: "correctedImportance" as const,
    value: 5,
  },
];

describe("media classification feedback", () => {
  it.each(MEDIA_CLASSIFICATION_FEEDBACK_REASONS)(
    "persists %s feedback",
    async (reason) => {
      const store = new InMemoryFeedbackStore();
      const feedback = await setMediaClassificationFeedback(store, {
        articleId: "article-1",
        reasons: [reason],
        reviewedAt: firstReview,
      });

      expect(feedback).toEqual({
        mediaArticleId: "article-1",
        reasons: [reason],
        ...EMPTY_CORRECTIONS,
        reviewedAt: firstReview,
      });
      expect(store.feedback).toEqual(feedback);
    },
  );

  it.each(correctionCases)(
    "persists an optional $field correction with $reason",
    async ({ reason, corrections, field, value }) => {
      const store = new InMemoryFeedbackStore();
      const feedback = await setMediaClassificationFeedback(store, {
        articleId: "article-1",
        reasons: [reason],
        corrections,
        reviewedAt: firstReview,
      });

      expect(feedback?.[field]).toBe(value);
      expect(feedback?.reasons).toEqual([reason]);
    },
  );

  it("allows a wrong-classification reason without a correction", async () => {
    const store = new InMemoryFeedbackStore();
    const feedback = await setMediaClassificationFeedback(store, {
      articleId: "article-1",
      reasons: ["WRONG_EVENT_TYPE"],
      reviewedAt: firstReview,
    });

    expect(feedback).toMatchObject({
      reasons: ["WRONG_EVENT_TYPE"],
      ...EMPTY_CORRECTIONS,
    });
  });

  it("persists multiple independent corrections", async () => {
    const store = new InMemoryFeedbackStore();
    const feedback = await setMediaClassificationFeedback(store, {
      articleId: "article-1",
      reasons: [
        "WRONG_SECTOR",
        "WRONG_EVENT_TYPE",
        "WRONG_AI_TAG",
        "WRONG_IMPORTANCE",
      ],
      corrections: {
        correctedSector: "gaming",
        correctedEventType: "LAYOFFS",
        correctedAiTag: "LABOR_DISPLACEMENT",
        correctedImportance: 4,
      },
      reviewedAt: firstReview,
    });

    expect(feedback).toMatchObject({
      correctedSector: "gaming",
      correctedEventType: "LAYOFFS",
      correctedAiTag: "LABOR_DISPLACEMENT",
      correctedImportance: 4,
    });
  });

  it("persists multiple reasons without changing machine classification", async () => {
    const store = new InMemoryFeedbackStore();
    const originalClassification = { ...store.machineClassification };

    const feedback = await setMediaClassificationFeedback(store, {
      articleId: "article-1",
      reasons: ["NOT_RELEVANT_TO_CULTURAL_INTELLIGENCE", "WRONG_EVENT_TYPE"],
      corrections: { correctedEventType: "DEMAND_WEAKNESS" },
      reviewedAt: firstReview,
    });

    expect(feedback?.reasons).toEqual([
      "WRONG_EVENT_TYPE",
      "NOT_RELEVANT_TO_CULTURAL_INTELLIGENCE",
    ]);
    expect(store.machineClassification).toEqual(originalClassification);
  });

  it.each(correctionCases)(
    "clears $field when $reason is removed",
    async ({ reason, corrections, field }) => {
      const store = new InMemoryFeedbackStore();
      await setMediaClassificationFeedback(store, {
        articleId: "article-1",
        reasons: [reason, "NOT_RELEVANT_TO_CULTURAL_INTELLIGENCE"],
        corrections,
        reviewedAt: firstReview,
      });

      const changed = await setMediaClassificationFeedback(store, {
        articleId: "article-1",
        reasons: ["NOT_RELEVANT_TO_CULTURAL_INTELLIGENCE"],
        corrections,
        reviewedAt: secondReview,
      });

      expect(changed?.[field]).toBeNull();
      expect(changed?.reasons).toEqual([
        "NOT_RELEVANT_TO_CULTURAL_INTELLIGENCE",
      ]);
    },
  );

  it("updates a correction and treats an identical update idempotently", async () => {
    const store = new InMemoryFeedbackStore();
    await setMediaClassificationFeedback(store, {
      articleId: "article-1",
      reasons: ["WRONG_SECTOR"],
      corrections: { correctedSector: "film" },
      reviewedAt: firstReview,
    });
    const changed = await setMediaClassificationFeedback(store, {
      articleId: "article-1",
      reasons: ["WRONG_SECTOR"],
      corrections: { correctedSector: "gaming" },
      reviewedAt: secondReview,
    });
    const repeated = await setMediaClassificationFeedback(store, {
      articleId: "article-1",
      reasons: ["WRONG_SECTOR"],
      corrections: { correctedSector: "gaming" },
      reviewedAt: new Date("2026-08-17T10:00:00Z"),
    });

    expect(changed?.correctedSector).toBe("gaming");
    expect(repeated).toEqual(changed);
    expect(store.upsertCount).toBe(2);
  });

  it("adds and removes a correction while retaining its error reason", async () => {
    const store = new InMemoryFeedbackStore();
    const withoutCorrection = await setMediaClassificationFeedback(store, {
      articleId: "article-1",
      reasons: ["WRONG_EVENT_TYPE"],
      reviewedAt: firstReview,
    });
    const withCorrection = await setMediaClassificationFeedback(store, {
      articleId: "article-1",
      reasons: ["WRONG_EVENT_TYPE"],
      corrections: { correctedEventType: "CLOSURE" },
      reviewedAt: secondReview,
    });
    const removedCorrection = await setMediaClassificationFeedback(store, {
      articleId: "article-1",
      reasons: ["WRONG_EVENT_TYPE"],
      corrections: { correctedEventType: null },
      reviewedAt: new Date("2026-08-17T10:00:00Z"),
    });

    expect(withoutCorrection?.correctedEventType).toBeNull();
    expect(withCorrection?.correctedEventType).toBe("CLOSURE");
    expect(removedCorrection).toMatchObject({
      reasons: ["WRONG_EVENT_TYPE"],
      correctedEventType: null,
    });
  });

  it("changes existing feedback and review timestamp", async () => {
    const store = new InMemoryFeedbackStore();
    await setMediaClassificationFeedback(store, {
      articleId: "article-1",
      reasons: ["WRONG_SECTOR"],
      reviewedAt: firstReview,
    });

    const changed = await setMediaClassificationFeedback(store, {
      articleId: "article-1",
      reasons: ["WRONG_AI_TAG", "WRONG_IMPORTANCE"],
      reviewedAt: secondReview,
    });

    expect(changed).toMatchObject({
      reasons: ["WRONG_AI_TAG", "WRONG_IMPORTANCE"],
      reviewedAt: secondReview,
    });
    expect(store.upsertCount).toBe(2);
  });

  it("clears feedback idempotently", async () => {
    const store = new InMemoryFeedbackStore();
    await setMediaClassificationFeedback(store, {
      articleId: "article-1",
      reasons: ["WRONG_EVENT_TYPE"],
      corrections: { correctedEventType: "CLOSURE" },
      reviewedAt: firstReview,
    });

    expect(store.feedback?.correctedEventType).toBe("CLOSURE");

    expect(
      await setMediaClassificationFeedback(store, {
        articleId: "article-1",
        reasons: [],
        reviewedAt: secondReview,
      }),
    ).toBeNull();
    expect(store.feedback).toBeNull();
    expect(store.deleteCount).toBe(1);

    await setMediaClassificationFeedback(store, {
      articleId: "article-1",
      reasons: [],
      reviewedAt: secondReview,
    });
    expect(store.deleteCount).toBe(1);
  });

  it("does not rewrite identical feedback or its original review timestamp", async () => {
    const store = new InMemoryFeedbackStore();
    const first = await setMediaClassificationFeedback(store, {
      articleId: "article-1",
      reasons: ["WRONG_EVENT_TYPE", "WRONG_SECTOR", "WRONG_EVENT_TYPE"],
      reviewedAt: firstReview,
    });
    const repeated = await setMediaClassificationFeedback(store, {
      articleId: "article-1",
      reasons: ["WRONG_SECTOR", "WRONG_EVENT_TYPE"],
      reviewedAt: secondReview,
    });

    expect(repeated).toEqual(first);
    expect(repeated?.reviewedAt).toEqual(firstReview);
    expect(store.upsertCount).toBe(1);
  });

  it("rejects unknown reasons and missing articles", async () => {
    const store = new InMemoryFeedbackStore();
    await expect(
      setMediaClassificationFeedback(store, {
        articleId: "article-1",
        reasons: ["NOT_A_REASON"],
        reviewedAt: firstReview,
      }),
    ).rejects.toBeInstanceOf(InvalidMediaClassificationFeedbackError);
    await expect(
      setMediaClassificationFeedback(store, {
        articleId: "missing",
        reasons: ["WRONG_SECTOR"],
        reviewedAt: firstReview,
      }),
    ).rejects.toBeInstanceOf(MediaArticleNotFoundError);
  });

  it.each([
    { reasons: ["WRONG_SECTOR"], corrections: { correctedSector: "sports" } },
    {
      reasons: ["WRONG_EVENT_TYPE"],
      corrections: { correctedEventType: "NOT_AN_EVENT" },
    },
    { reasons: ["WRONG_AI_TAG"], corrections: { correctedAiTag: "NONE" } },
    {
      reasons: ["WRONG_IMPORTANCE"],
      corrections: { correctedImportance: 6 },
    },
  ])("rejects invalid correction values", async ({ reasons, corrections }) => {
    const store = new InMemoryFeedbackStore();
    await expect(
      setMediaClassificationFeedback(store, {
        articleId: "article-1",
        reasons,
        corrections,
        reviewedAt: firstReview,
      }),
    ).rejects.toBeInstanceOf(InvalidMediaClassificationFeedbackError);
  });
});
