import { getSourceDefinition } from "@/data-sources/catalog";
import { getSourceConfigurationStatus } from "@/data-sources/configuration";
import {
  buildFredObservationsUrl,
  fetchFredObservationsJson,
  fetchFredSeriesMetadata,
  sanitiseFredUrl,
  type FredRequestOptions,
} from "@/data-sources/macro/fred-api";
import { FRED_METRICS, getFredMetric } from "@/data-sources/macro/fred-metrics";
import { formatFredDate } from "@/data-sources/macro/fred-period";
import { parseFredObservations } from "@/data-sources/macro/fred-response";
import type {
  AvailableMetric,
  DataSourceAdapter,
  DataSourceHealth,
  NormalisedObservation,
  ObservationRequest,
} from "@/data-sources/types";
import { HttpRequestError } from "@/lib/http";

export type FredAdapterOptions = FredRequestOptions & {
  getBaseUrl: () => string | undefined;
  getApiKey: () => string | undefined;
  now?: () => Date;
};

export class UnsupportedFredMetricError extends Error {
  constructor(metricSlug: string) {
    super(`FRED metric "${metricSlug}" is not supported.`);
    this.name = "UnsupportedFredMetricError";
  }
}

export class FredDataSourceAdapter implements DataSourceAdapter {
  readonly slug = "fred";
  readonly name = "FRED";
  readonly countries = ["US"] as const;
  readonly sectors = ["consumer-spending"] as const;

  constructor(private readonly options: FredAdapterOptions) {}

  isConfigured(): boolean {
    return getSourceConfigurationStatus(getSourceDefinition("fred"), {
      FRED_BASE_URL: this.options.getBaseUrl(),
      FRED_API_KEY: this.options.getApiKey(),
    }).configured;
  }

  async healthCheck(): Promise<DataSourceHealth> {
    const checkedAt = (this.options.now ?? (() => new Date()))();
    const baseUrl = this.options.getBaseUrl();
    const apiKey = this.options.getApiKey();
    if (!baseUrl || !apiKey || !this.isConfigured()) {
      return {
        status: "unavailable",
        checkedAt: checkedAt.toISOString(),
        message: "FRED API configuration is incomplete.",
      };
    }
    try {
      const result = await fetchFredSeriesMetadata(
        baseUrl,
        apiKey,
        FRED_METRICS[0],
        { ...this.options, timeoutMs: this.options.timeoutMs ?? 5_000 },
      );
      return {
        status: "healthy",
        checkedAt: checkedAt.toISOString(),
        latencyMs: result.latencyMs,
        message: "FRED series metadata endpoint responded successfully.",
      };
    } catch (error) {
      const degraded =
        error instanceof HttpRequestError &&
        (error.kind === "http" || error.kind === "rate-limit");
      return {
        status: degraded ? "degraded" : "unavailable",
        checkedAt: checkedAt.toISOString(),
        message:
          error instanceof HttpRequestError
            ? error.message
            : "FRED health check failed.",
      };
    }
  }

  async fetchAvailableMetrics(): Promise<AvailableMetric[]> {
    return FRED_METRICS.map(({ slug, name, description, unit, frequency }) => ({
      slug,
      name,
      description,
      unit,
      frequency,
    }));
  }

  async fetchObservations(
    request: ObservationRequest,
  ): Promise<NormalisedObservation[]> {
    const baseUrl = this.options.getBaseUrl();
    const apiKey = this.options.getApiKey();
    if (!baseUrl || !apiKey || !this.isConfigured()) {
      throw new Error("FRED API configuration is incomplete.");
    }
    if (request.countryCode && request.countryCode !== "US") {
      throw new Error("FRED credit metrics currently support the US only.");
    }
    if (request.endDate < request.startDate) {
      throw new Error("FRED observation end date must not precede start date.");
    }
    const metric = getFredMetric(request.metricSlug);
    if (!metric) throw new UnsupportedFredMetricError(request.metricSlug);

    const series = await fetchFredSeriesMetadata(
      baseUrl,
      apiKey,
      metric,
      this.options,
    );
    const url = buildFredObservationsUrl(
      baseUrl,
      apiKey,
      metric.seriesId,
      formatFredDate(request.startDate),
      formatFredDate(request.endDate),
    );
    const requestUrl = sanitiseFredUrl(url);
    const retrievedAt = (this.options.now ?? (() => new Date()))();
    const payload = await fetchFredObservationsJson(url, this.options);
    return parseFredObservations(
      payload,
      metric,
      series.metadata,
      requestUrl,
      retrievedAt,
      request.startDate,
      request.endDate,
    );
  }
}
