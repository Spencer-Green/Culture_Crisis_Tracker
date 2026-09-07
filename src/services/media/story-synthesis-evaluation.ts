import "server-only";

import { getMediaClassificationFeedbackEvaluationRows } from "@/services/media/media-feedback";
import { getCurrentStorySynthesisCandidates } from "@/services/media/story-synthesis";
import type { StoryReviewAudit } from "@/services/media/story-synthesis-evaluation-core";

function clusterHasCorrectReview(
  cluster: Awaited<
    ReturnType<typeof getCurrentStorySynthesisCandidates>
  >[number],
) {
  return cluster.articles.some(
    (article) => article.classificationFeedback?.reviewState === "CORRECT",
  );
}

function clusterHasCorrection(
  cluster: Awaited<
    ReturnType<typeof getCurrentStorySynthesisCandidates>
  >[number],
) {
  return cluster.articles.some((article) => {
    const feedback = article.classificationFeedback;
    return (
      feedback?.correctedSector != null ||
      feedback?.correctedEventType != null ||
      feedback?.correctedEventTypeToNull === true ||
      feedback?.correctedAiTag != null ||
      feedback?.correctedSignalDirection != null ||
      feedback?.correctedImportance != null
    );
  });
}

export async function loadStorySynthesisEvaluationContext(input?: {
  now?: Date;
  hours?: number;
}) {
  const [feedbackRows, candidates] = await Promise.all([
    getMediaClassificationFeedbackEvaluationRows(),
    getCurrentStorySynthesisCandidates(input),
  ]);
  const reviewedRows = feedbackRows.filter((row) => row.feedback !== null);
  const correctRows = reviewedRows.filter(
    (row) => row.feedback?.reviewState === "CORRECT",
  );
  const wrongRows = reviewedRows.filter(
    (row) => row.feedback?.reviewState === "WRONG_CLASSIFICATION",
  );
  const reviewAudit: StoryReviewAudit = {
    totalArticles: feedbackRows.length,
    reviewedArticles: reviewedRows.length,
    correctArticles: correctRows.length,
    wrongArticles: wrongRows.length,
    correctionCoverage: {
      sector: wrongRows.filter((row) => row.feedback?.correctedSector != null)
        .length,
      eventType: wrongRows.filter(
        (row) =>
          row.feedback?.correctedEventType != null ||
          row.feedback?.correctedEventTypeToNull === true,
      ).length,
      aiTag: wrongRows.filter((row) => row.feedback?.correctedAiTag != null)
        .length,
      signalDirection: wrongRows.filter(
        (row) => row.feedback?.correctedSignalDirection != null,
      ).length,
      importance: wrongRows.filter(
        (row) => row.feedback?.correctedImportance != null,
      ).length,
    },
    eligibleClusters: candidates.length,
    reviewedEligibleClusters: candidates.filter(
      (cluster) => cluster.humanReviewState !== "unreviewed",
    ).length,
    confirmedEligibleClusters: candidates.filter(clusterHasCorrectReview)
      .length,
    correctedEligibleClusters: candidates.filter(clusterHasCorrection).length,
    ambiguousEligibleClusters: candidates.filter(
      (cluster) => cluster.ambiguousHumanCorrections,
    ).length,
  };
  return { candidates, reviewAudit };
}
