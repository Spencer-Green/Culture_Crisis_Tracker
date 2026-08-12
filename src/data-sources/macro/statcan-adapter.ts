import { getSourceDefinition } from "@/data-sources/catalog";
import { getSourceConfigurationStatus } from "@/data-sources/configuration";
import {
  fetchStatCanSeriesInfo,
  fetchStatCanVectorData,
  parseStatCanSeriesInfo,
  StatCanResponseError,
  validateStatCanSeriesInfo,
  type StatCanRequestOptions,
} from "@/data-sources/macro/statcan-api";
import {
  getStatCanMetric,
  STATCAN_METRICS,
} from "@/data-sources/macro/statcan-metrics";
import { parseStatCanObservations } from "@/data-sources/macro/statcan-response";
import type {
  AvailableMetric,
  DataSourceAdapter,
  DataSourceHealth,
  NormalisedObservation,
  ObservationRequest,
} from "@/data-sources/types";

export type StatCanAdapterOptions = StatCanRequestOptions & {
  getBaseUrl: () => string | undefined;
  now?: () => Date;
};

export class UnsupportedStatCanMetricError extends Error {
  constructor(metricSlug: string) {
    super(`Statistics Canada metric "${metricSlug}" is not supported.`);
    this.name = "UnsupportedStatCanMetricError";
  }
}

export class StatCanDataSourceAdapter implements DataSourceAdapter {
  readonly slug = "statcan";
  readonly name = "Statistics Canada";
  readonly countries = ["CA"] as const;
  readonly sectors = ["consumer-spending"] as const;

  constructor(private readonly options: StatCanAdapterOptions) {}

  isConfigured(): boolean {
    return getSourceConfigurationStatus(getSourceDefinition("statcan"), {
      STATCAN_BASE_URL: this.options.getBaseUrl(),
    }).configured;
  }

  async healthCheck(): Promise<DataSourceHealth> {
    const checkedAt = (this.options.now ?? (() => new Date()))();
    const baseUrl = this.options.getBaseUrl();
    if (!baseUrl || !this.isConfigured()) {
      return {
        status: "unavailable",
        checkedAt: checkedAt.toISOString(),
        message: "Statistics Canada WDS base URL is not configured.",
      };
    }
    try {
      const result = await fetchStatCanSeriesInfo(
        baseUrl,
        36100124,
        STATCAN_METRICS[0].coordinate,
        { ...this.options, timeoutMs: this.options.timeoutMs ?? 5_000 },
      );
      const series = parseStatCanSeriesInfo(result.payload);
      validateStatCanSeriesInfo(series, STATCAN_METRICS[0]);
      return {
        status: "healthy",
        checkedAt: checkedAt.toISOString(),
        latencyMs: result.latencyMs,
        message:
          "Statistics Canada WDS series metadata responded successfully.",
      };
    } catch (error) {
      return {
        status:
          error instanceof StatCanResponseError ? "degraded" : "unavailable",
        checkedAt: checkedAt.toISOString(),
        message:
          error instanceof StatCanResponseError
            ? error.message
            : "Statistics Canada health check failed.",
      };
    }
  }

  async fetchAvailableMetrics(): Promise<AvailableMetric[]> {
    return STATCAN_METRICS.map(
      ({ slug, name, description, unit, frequency }) => ({
        slug,
        name,
        description,
        unit,
        frequency,
      }),
    );
  }

  async fetchObservations(
    request: ObservationRequest,
  ): Promise<NormalisedObservation[]> {
    const baseUrl = this.options.getBaseUrl();
    if (!baseUrl || !this.isConfigured()) {
      throw new Error("Statistics Canada WDS base URL is not configured.");
    }
    if (request.countryCode && request.countryCode !== "CA") {
      throw new Error(
        "Statistics Canada household-consumption metrics support Canada only.",
      );
    }
    if (request.endDate < request.startDate) {
      throw new Error(
        "Statistics Canada observation end quarter must not precede start quarter.",
      );
    }
    const metric = getStatCanMetric(request.metricSlug);
    if (!metric) throw new UnsupportedStatCanMetricError(request.metricSlug);

    const metadata = await fetchStatCanSeriesInfo(
      baseUrl,
      36100124,
      metric.coordinate,
      this.options,
    );
    const series = parseStatCanSeriesInfo(metadata.payload);
    validateStatCanSeriesInfo(series, metric);
    const retrievedAt = (this.options.now ?? (() => new Date()))();
    const data = await fetchStatCanVectorData(
      baseUrl,
      metric,
      request.startDate,
      request.endDate,
      this.options,
    );
    return parseStatCanObservations(
      data.payload,
      metric,
      series,
      data.url.toString(),
      retrievedAt,
      request.startDate,
      request.endDate,
    );
  }
}
