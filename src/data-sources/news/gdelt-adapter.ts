import { getSourceDefinition } from "@/data-sources/catalog";
import { getSourceConfigurationStatus } from "@/data-sources/configuration";
import {
  fetchGdeltArticleList,
  type GdeltArticleRequest,
  type GdeltArticleResponse,
  type GdeltRequestOptions,
} from "@/data-sources/news/gdelt-api";
import type {
  AvailableMetric,
  DataSourceAdapter,
  DataSourceHealth,
  NormalisedObservation,
  ObservationRequest,
} from "@/data-sources/types";
import { HttpRequestError } from "@/lib/http";

export type GdeltAdapterOptions = GdeltRequestOptions & {
  getBaseUrl: () => string | undefined;
  now?: () => Date;
};

export class GdeltCandidateAdapterError extends Error {
  constructor() {
    super("GDELT supplies article candidates rather than metric observations.");
    this.name = "GdeltCandidateAdapterError";
  }
}

export class GdeltDataSourceAdapter implements DataSourceAdapter {
  readonly slug = "gdelt";
  readonly name = "GDELT";
  readonly countries = ["AU", "US", "GB", "CA"] as const;
  readonly sectors = [
    "music",
    "film",
    "theatre",
    "gaming",
    "industry-events",
  ] as const;

  constructor(private readonly options: GdeltAdapterOptions) {}

  isConfigured(): boolean {
    return getSourceConfigurationStatus(getSourceDefinition("gdelt"), {
      GDELT_BASE_URL: this.options.getBaseUrl(),
    }).configured;
  }

  async healthCheck(): Promise<DataSourceHealth> {
    const checkedAt = (this.options.now ?? (() => new Date()))();
    const baseUrl = this.options.getBaseUrl();
    if (!baseUrl || !this.isConfigured()) {
      return {
        status: "unavailable",
        checkedAt: checkedAt.toISOString(),
        message: "GDELT DOC API configuration is incomplete.",
      };
    }
    try {
      const response = await fetchGdeltArticleList(
        baseUrl,
        {
          query: '"music venue"',
          queryFamily: "venue-closure",
          startDate: new Date(checkedAt.getTime() - 60 * 60 * 1_000),
          endDate: checkedAt,
          maxRecords: 1,
        },
        {
          ...this.options,
          timeoutMs: this.options.timeoutMs ?? 5_000,
          maxRetries: 0,
        },
      );
      return {
        status: "healthy",
        checkedAt: checkedAt.toISOString(),
        latencyMs: response.latencyMs,
        message: "GDELT DOC ArticleList endpoint responded successfully.",
      };
    } catch (error) {
      const degraded =
        error instanceof HttpRequestError &&
        (error.kind === "rate-limit" || error.kind === "http");
      return {
        status: degraded ? "degraded" : "unavailable",
        checkedAt: checkedAt.toISOString(),
        message:
          error instanceof HttpRequestError
            ? error.message
            : "GDELT health check failed.",
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
    return Promise.reject(new GdeltCandidateAdapterError());
  }

  fetchArticles(request: GdeltArticleRequest): Promise<GdeltArticleResponse> {
    const baseUrl = this.options.getBaseUrl();
    if (!baseUrl || !this.isConfigured()) {
      throw new Error("GDELT DOC API configuration is incomplete.");
    }
    return fetchGdeltArticleList(baseUrl, request, this.options);
  }
}
