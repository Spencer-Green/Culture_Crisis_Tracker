import {
  buildMediaStoryClusters,
  isAiIntelligenceStory,
  isMaterialStorySignal,
  type MediaStoryCluster,
} from "@/services/media/daily-brief-core";
import type { MediaArticleView } from "@/services/media/media-service-core";
import type { MonitorFilters } from "./core";

export function selectDevelopments(
  articles: MediaArticleView[],
  filters: MonitorFilters,
) {
  return buildMediaStoryClusters(articles)
    .filter(
      (story) =>
        isMaterialStorySignal(story) &&
        (!filters.sector || story.sector === filters.sector) &&
        (!filters.country ||
          story.articles.some((a) => a.countryCode === filters.country)) &&
        (!filters.aiOnly || isAiIntelligenceStory(story)),
    )
    .sort(
      (a, b) =>
        b.importance - a.importance ||
        a.earliestPublishedAt.localeCompare(b.earliestPublishedAt) * -1 ||
        a.representativeArticleId.localeCompare(b.representativeArticleId),
    );
}
export function storyDiscovery(story: MediaStoryCluster) {
  const dates = story.articles
    .map((a) => a.firstSeenAt)
    .filter((date): date is string => !!date)
    .sort();
  return dates.length === story.articles.length ? dates[0] : null;
}
