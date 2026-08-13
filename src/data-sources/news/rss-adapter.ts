import type {
  AvailableMetric,
  DataSourceAdapter,
  DataSourceHealth,
  NormalisedObservation,
  ObservationRequest,
} from "@/data-sources/types";
import { fetchRssFeed } from "@/data-sources/news/rss-api";
import { enabledRssFeeds } from "@/data-sources/news/rss-registry";

export class RssDataSourceAdapter implements DataSourceAdapter {
  readonly slug = "rss";
  readonly name = "Curated RSS Feeds";
  readonly countries = ["AU", "US", "GB", "CA", "NZ", "EU"] as const;
  readonly sectors = [
    "music",
    "film",
    "theatre",
    "gaming",
    "ai-policy",
    "industry-events",
  ] as const;
  isConfigured(): boolean {
    return enabledRssFeeds().length > 0;
  }
  async healthCheck(): Promise<DataSourceHealth> {
    const checkedAt = new Date();
    try {
      const response = await fetchRssFeed(enabledRssFeeds()[0], {
        timeoutMs: 5_000,
      });
      return {
        status: "healthy",
        checkedAt: checkedAt.toISOString(),
        latencyMs: response.latencyMs,
        message: "A curated publisher feed responded successfully.",
      };
    } catch {
      return {
        status: "degraded",
        checkedAt: checkedAt.toISOString(),
        message: "The sampled curated feed was unavailable.",
      };
    }
  }
  fetchAvailableMetrics(): Promise<AvailableMetric[]> {
    return Promise.resolve([]);
  }
  fetchObservations(
    request: ObservationRequest,
  ): Promise<NormalisedObservation[]> {
    void request;
    return Promise.reject(
      new Error("RSS supplies media articles, not metric observations."),
    );
  }
}
