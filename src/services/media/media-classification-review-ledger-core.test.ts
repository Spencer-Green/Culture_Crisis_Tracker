import { describe, expect, it } from "vitest";

import {
  mediaClassificationInputHash,
  setMediaClassificationFeedbackWithLedger,
  type MediaClassificationReviewEventDraft,
  type MediaClassificationReviewLedgerStore,
  type MediaClassificationReviewSnapshot,
} from "@/services/media/media-classification-review-ledger-core";
import { setMediaClassificationFeedback } from "@/services/media/media-feedback-core";
import type {
  MediaClassificationCorrections,
  MediaClassificationFeedbackReason,
  MediaMachineClassificationSnapshot,
  PersistedMediaClassificationReviewState,
} from "@/services/media/media-feedback-types";

const MACHINE: MediaMachineClassificationSnapshot = {
  sector: "gaming",
  eventType: "AI_ADOPTION",
  aiTag: "TOOL_ADOPTION",
  signalDirection: "AMBIGUOUS",
  importance: 2,
  confidence: "low",
};

function reviewSnapshot(): MediaClassificationReviewSnapshot {
  return {
    mediaArticleId: "article-1",
    canonicalUrl: "https://example.com/story",
    storyFingerprint: "story-fingerprint",
    publishedAt: new Date("2026-08-30T00:00:00.000Z"),
    predictedAt: new Date("2026-08-30T01:00:00.000Z"),
    inputSnapshot: {
      schemaVersion: "media-classification-input-v1",
      title: "A reviewed headline",
      description: "A supplied classifier description.",
      publisher: "Example Publisher",
      sourceDomain: "example.com",
      sourceType: "RSS",
      sourceId: "source-1",
      sourceSlug: "example-source",
      externalId: "external-1",
      canonicalUrl: "https://example.com/story",
      publishedAt: "2026-08-30T00:00:00.000Z",
      language: "en",
      sourceMetadata: { evidenceRole: "JOURNALISTIC_REPORTING" },
      sourceMatches: [
        {
          sourceType: "RSS",
          sourceSlug: "media-rss",
          externalId: "external-1",
          queryFamily: null,
          queryDefinition: null,
          feedSlug: "example-feed",
          feedDefinition: { sector: "gaming" },
          metadata: {},
        },
      ],
    },
    machineClassification: { ...MACHINE },
    machinePrediction: {
      sector: MACHINE.sector,
      eventType: MACHINE.eventType,
      signalDirection: MACHINE.signalDirection,
      importance: MACHINE.importance,
      confidence: MACHINE.confidence,
      legacyAiImpactType: MACHINE.aiTag,
      polarity: "neutral/ambiguous",
      countryCode: "USA",
      reviewState: "unreviewed",
      classificationRationale: "Fixture machine rationale.",
      aiCategory: "AI_ADOPTION",
      claimKind: "OBSERVED_ACTION",
    },
  };
}

class InMemoryReviewLedgerStore implements MediaClassificationReviewLedgerStore {
  machineClassification = { ...MACHINE };
  snapshot = reviewSnapshot();
  feedback: Awaited<
    ReturnType<MediaClassificationReviewLedgerStore["upsertFeedback"]>
  > | null = null;
  events: Array<MediaClassificationReviewEventDraft & { id: string }> = [];

  async findArticle(articleId: string) {
    if (articleId !== this.snapshot.mediaArticleId) return null;
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
    this.feedback = null;
  }

  async findReviewSnapshot(articleId: string) {
    return articleId === this.snapshot.mediaArticleId ? this.snapshot : null;
  }

  async findLatestReviewEventId() {
    return this.events.at(-1)?.id ?? null;
  }

  async appendReviewEvent(event: MediaClassificationReviewEventDraft) {
    const persisted = {
      ...structuredClone(event),
      id: `event-${this.events.length + 1}`,
    };
    this.events.push(persisted);
    return { id: persisted.id };
  }
}

const reviewedAt = new Date("2026-08-30T02:00:00.000Z");

async function review(
  store: InMemoryReviewLedgerStore,
  input: {
    reviewState: "CORRECT" | "WRONG_CLASSIFICATION" | "UNREVIEWED";
    reasons?: MediaClassificationFeedbackReason[];
    corrections?: Partial<MediaClassificationCorrections>;
    at?: Date;
  },
) {
  return setMediaClassificationFeedbackWithLedger(store, {
    articleId: "article-1",
    reviewState: input.reviewState,
    reasons: input.reasons ?? [],
    corrections: input.corrections,
    reviewedAt: input.at ?? reviewedAt,
    codeRevision: "test-revision",
  });
}

describe("immutable media classification review ledger", () => {
  it("records whole-classification approval as explicit approved dimensions", async () => {
    const store = new InMemoryReviewLedgerStore();
    await review(store, { reviewState: "CORRECT" });

    const event = store.events[0];
    expect(event.action).toBe("CORRECT");
    expect(event.sectorReviewStatus).toBe("APPROVED");
    expect(event.eventTypeReviewStatus).toBe("APPROVED");
    expect(event.signalDirectionReviewStatus).toBe("APPROVED");
    expect(event.importanceReviewStatus).toBe("APPROVED");
    expect(event.confidenceReviewStatus).toBe("APPROVED");
    expect(event.relevanceReviewStatus).toBe("APPROVED");
    expect(event.legacyAiReviewStatus).toBe("APPROVED");
    expect(event.humanEventType).toBe("AI_ADOPTION");
    expect(event.humanRelevant).toBe(true);
    expect(event.classifierVersion).toBeTruthy();
    expect(event.taxonomyVersion).toBeTruthy();
    expect(event.inputSchemaVersion).toBeTruthy();
    expect(event.codeRevision).toBe("test-revision");
  });

  it("records a signal-only correction without approving other dimensions", async () => {
    const store = new InMemoryReviewLedgerStore();
    await review(store, {
      reviewState: "WRONG_CLASSIFICATION",
      reasons: ["WRONG_SIGNAL_DIRECTION"],
      corrections: { correctedSignalDirection: "NEGATIVE" },
    });

    const event = store.events[0];
    expect(event.signalDirectionReviewStatus).toBe("CORRECTED");
    expect(event.humanSignalDirection).toBe("NEGATIVE");
    expect(event.sectorReviewStatus).toBe("UNREVIEWED");
    expect(event.eventTypeReviewStatus).toBe("UNREVIEWED");
    expect(event.importanceReviewStatus).toBe("UNREVIEWED");
    expect(event.relevanceReviewStatus).toBe("UNREVIEWED");
  });

  it("distinguishes an explicit null event correction from unreviewed", async () => {
    const store = new InMemoryReviewLedgerStore();
    await review(store, {
      reviewState: "WRONG_CLASSIFICATION",
      reasons: ["WRONG_EVENT_TYPE"],
      corrections: { correctedEventTypeToNull: true },
    });

    const event = store.events[0];
    expect(event.eventTypeReviewStatus).toBe("CORRECTED");
    expect(event.humanEventType).toBeNull();
    expect(event.sectorReviewStatus).toBe("UNREVIEWED");
  });

  it("records a wrong event without a target as rejected", async () => {
    const store = new InMemoryReviewLedgerStore();
    await review(store, {
      reviewState: "WRONG_CLASSIFICATION",
      reasons: ["WRONG_EVENT_TYPE"],
    });

    expect(store.events[0].eventTypeReviewStatus).toBe("REJECTED");
    expect(store.events[0].humanEventType).toBeNull();
  });

  it("records NOT_RELEVANT as an explicit relevance rejection", async () => {
    const store = new InMemoryReviewLedgerStore();
    await review(store, {
      reviewState: "WRONG_CLASSIFICATION",
      reasons: ["NOT_RELEVANT_TO_CULTURAL_INTELLIGENCE"],
    });

    expect(store.events[0].relevanceReviewStatus).toBe("REJECTED");
    expect(store.events[0].humanRelevant).toBe(false);
    expect(store.events[0].sectorReviewStatus).toBe("UNREVIEWED");
  });

  it("appends revisions and links each event to the event it supersedes", async () => {
    const store = new InMemoryReviewLedgerStore();
    await review(store, { reviewState: "CORRECT" });
    await review(store, {
      reviewState: "WRONG_CLASSIFICATION",
      reasons: ["WRONG_IMPORTANCE"],
      corrections: { correctedImportance: 4 },
      at: new Date("2026-08-30T03:00:00.000Z"),
    });

    expect(store.events).toHaveLength(2);
    expect(store.events[0].supersedesReviewEventId).toBeNull();
    expect(store.events[1].supersedesReviewEventId).toBe("event-1");
    expect(store.events[0].action).toBe("CORRECT");
    expect(store.events[1].humanImportance).toBe(4);
  });

  it("appends an explicit repeated review even when operational state is unchanged", async () => {
    const store = new InMemoryReviewLedgerStore();
    await review(store, { reviewState: "CORRECT" });
    await review(store, {
      reviewState: "CORRECT",
      at: new Date("2026-08-30T03:00:00.000Z"),
    });

    expect(store.events).toHaveLength(2);
    expect(store.events[1].supersedesReviewEventId).toBe("event-1");
    expect(store.events[1].action).toBe("CORRECT");
  });

  it("preserves review history when operational feedback is cleared", async () => {
    const store = new InMemoryReviewLedgerStore();
    await review(store, { reviewState: "CORRECT" });
    await review(store, {
      reviewState: "UNREVIEWED",
      at: new Date("2026-08-30T03:00:00.000Z"),
    });

    expect(store.feedback).toBeNull();
    expect(store.events).toHaveLength(2);
    expect(store.events[0].action).toBe("CORRECT");
    expect(store.events[1].action).toBe("CLEAR");
    expect(store.events[1].sectorReviewStatus).toBe("UNREVIEWED");
    expect(store.events[1].supersedesReviewEventId).toBe("event-1");
  });

  it("keeps the original input snapshot after the article later changes", async () => {
    const store = new InMemoryReviewLedgerStore();
    await review(store, { reviewState: "CORRECT" });
    store.snapshot.inputSnapshot.title = "A later re-ingested headline";
    store.snapshot.inputSnapshot.description = "Later changed input.";

    expect(store.events[0].inputSnapshot.title).toBe("A reviewed headline");
    expect(store.events[0].inputSnapshot.description).toBe(
      "A supplied classifier description.",
    );
  });

  it("keeps the original machine prediction after later reclassification", async () => {
    const store = new InMemoryReviewLedgerStore();
    await review(store, { reviewState: "CORRECT" });
    store.machineClassification.eventType = null;
    store.snapshot.machinePrediction.eventType = null;
    store.snapshot.machinePrediction.importance = 1;

    expect(store.events[0].machinePrediction.eventType).toBe("AI_ADOPTION");
    expect(store.events[0].machinePrediction.importance).toBe(2);
  });

  it("keeps content hashing deterministic and sensitive to classifier input", () => {
    const first = {
      ...reviewSnapshot().inputSnapshot,
      sourceMetadata: { z: 2, a: 1 },
    };
    const reordered = { ...first, sourceMetadata: { a: 1, z: 2 } };
    expect(mediaClassificationInputHash(first)).toBe(
      mediaClassificationInputHash(reordered),
    );
    expect(
      mediaClassificationInputHash({ ...first, title: "Changed title" }),
    ).not.toBe(mediaClassificationInputHash(first));
  });

  it("preserves existing operational feedback semantics", async () => {
    const ledgerStore = new InMemoryReviewLedgerStore();
    const legacyStore = new InMemoryReviewLedgerStore();
    const input = {
      articleId: "article-1",
      reviewState: "WRONG_CLASSIFICATION",
      reasons: ["WRONG_EVENT_TYPE"] as const,
      corrections: { correctedEventTypeToNull: true },
      reviewedAt,
    };
    const withLedger = await setMediaClassificationFeedbackWithLedger(
      ledgerStore,
      input,
    );
    const operationalOnly = await setMediaClassificationFeedback(
      legacyStore,
      input,
    );

    expect(withLedger.feedback).toEqual(operationalOnly);
    expect(ledgerStore.feedback).toEqual(legacyStore.feedback);
    expect(ledgerStore.events).toHaveLength(1);
  });
});
