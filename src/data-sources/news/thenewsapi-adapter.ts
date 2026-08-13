import { getSourceDefinition } from "@/data-sources/catalog";
import { getSourceConfigurationStatus } from "@/data-sources/configuration";
import type { MediaQueryFamily } from "@/data-sources/news/media-queries";
import {
  fetchTheNewsApiArticles,
  type TheNewsApiOptions,
  type TheNewsApiResponse,
} from "@/data-sources/news/thenewsapi-api";
import type {
  AvailableMetric,
  DataSourceAdapter,
  DataSourceHealth,
  NormalisedObservation,
  ObservationRequest,
} from "@/data-sources/types";
import { HttpRequestError } from "@/lib/http";

export type TheNewsApiAdapterOptions = TheNewsApiOptions & {
  getBaseUrl: () => string | undefined;
  getApiToken: () => string | undefined;
  now?: () => Date;
};

export class TheNewsApiAdapter implements DataSourceAdapter {
  readonly slug = "thenewsapi";
  readonly name = "TheNewsAPI";
  readonly countries = ["AU", "US", "GB", "CA", "NZ", "EU"] as const;
  readonly sectors = [
    "music",
    "film",
    "theatre",
    "gaming",
    "ai-policy",
    "industry-events",
  ] as const;

  constructor(private readonly options: TheNewsApiAdapterOptions) {}

  isConfigured(): boolean {
    return getSourceConfigurationStatus(getSourceDefinition("thenewsapi"), {
      THENEWSAPI_BASE_URL: this.options.getBaseUrl(),
      THENEWSAPI_API_KEY: this.options.getApiToken(),
    }).configured;
  }

  async healthCheck(): Promise<DataSourceHealth> {
    const checkedAt = (this.options.now ?? (() => new Date()))();
    if (!this.isConfigured()) {
      return {
        status: "unavailable",
        checkedAt: checkedAt.toISOString(),
        message: "TheNewsAPI configuration is incomplete.",
      };
    }
    const family: MediaQueryFamily = {
      id: "health",
      name: "health check",
      search: '"creative industries"',
      sector: "industry-events",
      fallbackEventType: null,
      fallbackPolarity: "neutral/ambiguous",
      aiRelated: false,
    };
    try {
      const response = await this.fetchArticles({
        family,
        startDate: new Date(checkedAt.getTime() - 60 * 60 * 1_000),
        endDate: checkedAt,
      });
      return {
        status: "healthy",
        checkedAt: checkedAt.toISOString(),
        latencyMs: response.latencyMs,
        message: "TheNewsAPI news endpoint responded successfully.",
      };
    } catch (error) {
      return {
        status:
          error instanceof HttpRequestError &&
          (error.kind === "rate-limit" || error.kind === "http")
            ? "degraded"
            : "unavailable",
        checkedAt: checkedAt.toISOString(),
        message:
          error instanceof HttpRequestError
            ? error.message
            : "TheNewsAPI health check failed.",
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
      new Error("TheNewsAPI supplies media articles, not metric observations."),
    );
  }

  fetchArticles(input: {
    family: MediaQueryFamily;
    startDate: Date;
    endDate: Date;
  }): Promise<TheNewsApiResponse> {
    const baseUrl = this.options.getBaseUrl();
    const apiToken = this.options.getApiToken();
    if (!baseUrl || !apiToken || !this.isConfigured())
      throw new Error("TheNewsAPI configuration is incomplete.");
    return fetchTheNewsApiArticles(
      { baseUrl, apiToken, ...input },
      this.options,
    );
  }
}
