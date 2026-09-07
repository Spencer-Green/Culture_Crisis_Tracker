import type { MediaStoryCluster } from "@/services/media/daily-brief-core";
import type { StorySynthesisReadResult } from "@/services/media/production-story-synthesis-core";

export type StorySynthesisPresentationMap = Readonly<
  Record<string, StorySynthesisReadResult | undefined>
>;

export function synthesisRecord(
  values: ReadonlyMap<string, StorySynthesisReadResult>,
): Record<string, StorySynthesisReadResult> {
  return Object.fromEntries(values);
}

export function mapStorySynthesesToArticleIds(input: {
  clusters: readonly MediaStoryCluster[];
  syntheses: ReadonlyMap<string, StorySynthesisReadResult>;
}): Record<string, StorySynthesisReadResult> {
  const result: Record<string, StorySynthesisReadResult> = {};
  for (const cluster of input.clusters) {
    const synthesis = input.syntheses.get(cluster.clusterId);
    if (!synthesis?.artifact) continue;
    for (const articleId of cluster.articleIds) result[articleId] = synthesis;
  }
  return result;
}
