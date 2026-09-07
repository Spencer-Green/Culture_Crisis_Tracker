import "server-only";

import { getPrisma } from "@/lib/prisma";
import {
  buildProductionStorySynthesisIdentity,
  buildStorySynthesisReadResult,
  LUNA_STORY_SYNTHESIS_SOURCE_ID,
  selectLatestValidatedStoryArtifact,
  type StorySynthesisReadResult,
} from "@/services/media/production-story-synthesis-core";
import { PrismaProductionStorySynthesisStore } from "@/services/media/production-story-synthesis-store";
import { buildStorySynthesisEvidence } from "@/services/media/story-synthesis-core";
import { isStorySynthesisEligible } from "@/services/media/story-synthesis-core";
import type { MediaStoryCluster } from "@/services/media/daily-brief-core";

export async function getPersistedStorySyntheses(
  clusters: readonly MediaStoryCluster[],
): Promise<Map<string, StorySynthesisReadResult>> {
  if (clusters.length === 0) return new Map();
  const missing = () =>
    new Map(
      clusters.map((cluster) => [
        cluster.clusterId,
        { freshness: "MISSING" as const, artifact: null },
      ]),
    );
  try {
    const source = await getPrisma().dataSource.findUnique({
      where: { slug: LUNA_STORY_SYNTHESIS_SOURCE_ID },
      select: { id: true },
    });
    if (!source) return missing();
    const store = new PrismaProductionStorySynthesisStore(
      getPrisma(),
      source.id,
    );
    const eligible = clusters.flatMap((cluster) => {
      if (!isStorySynthesisEligible(cluster)) return [];
      const evidence = buildStorySynthesisEvidence(cluster);
      const currentIdentity = buildProductionStorySynthesisIdentity(evidence, {
        storyKey: cluster.comparisonKey,
      });
      return [{ cluster, evidence, currentIdentity }];
    });
    const latest = await store.latestValidated({
      storyKeys: eligible.map((item) => item.currentIdentity.storyKey),
      articleIds: eligible.flatMap((item) =>
        item.evidence.articles.map((article) => article.articleId),
      ),
    });
    const eligibleByClusterId = new Map(
      eligible.map((item) => [item.cluster.clusterId, item]),
    );
    return new Map(
      clusters.map((cluster) => {
        const current = eligibleByClusterId.get(cluster.clusterId);
        if (!current) {
          return [cluster.clusterId, { freshness: "MISSING", artifact: null }];
        }
        return [
          cluster.clusterId,
          buildStorySynthesisReadResult({
            currentIdentity: current.currentIdentity,
            latestValidated: selectLatestValidatedStoryArtifact({
              currentIdentity: current.currentIdentity,
              currentEvidenceArticleIds: current.evidence.articles.map(
                (article) => article.articleId,
              ),
              candidates: latest,
            }),
          }),
        ];
      }),
    );
  } catch {
    return missing();
  }
}
