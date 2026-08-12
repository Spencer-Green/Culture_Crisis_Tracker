import { getSourceDefinition } from "@/data-sources/catalog";
import { getSourceConfigurationStatus } from "@/data-sources/configuration";
import {
  buildBeaDataUrl,
  buildBeaHealthUrl,
  fetchBeaJson,
  sanitiseBeaUrl,
  type BeaRequestOptions,
} from "@/data-sources/macro/bea-api";
import { BEA_METRICS, getBeaMetric } from "@/data-sources/macro/bea-metrics";
import { formatBeaMonth, getBeaYears } from "@/data-sources/macro/bea-period";
import { parseBeaObservations } from "@/data-sources/macro/bea-response";
import type {
  AvailableMetric,
  DataSourceAdapter,
  DataSourceHealth,
  NormalisedObservation,
  ObservationRequest,
} from "@/data-sources/types";
import { HttpRequestError } from "@/lib/http";

export type BeaAdapterOptions = BeaRequestOptions & {
  getBaseUrl: () => string | undefined;
  getApiKey: () => string | undefined;
  now?: () => Date;
};

export class UnsupportedBeaMetricError extends Error {
  constructor(metricSlug: string) {
    super(`BEA metric "${metricSlug}" is not supported.`);
    this.name = "UnsupportedBeaMetricError";
  }
}

export class BeaDataSourceAdapter implements DataSourceAdapter {
  readonly slug = "bea";
  readonly name = "BEA";
  readonly countries = ["US"] as const;
  readonly sectors = ["consumer-spending"] as const;

  constructor(private readonly options: BeaAdapterOptions) {}

  isConfigured(): boolean {
    return getSourceConfigurationStatus(getSourceDefinition("bea"), {
      BEA_BASE_URL: this.options.getBaseUrl(),
      BEA_API_KEY: this.options.getApiKey(),
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
        message: "BEA API configuration is incomplete.",
      };
    }

    try {
      const result = await fetchBeaJson(buildBeaHealthUrl(baseUrl, apiKey), {
        ...this.options,
        timeoutMs: this.options.timeoutMs ?? 5_000,
      });
      return {
        status: "healthy",
        checkedAt: checkedAt.toISOString(),
        latencyMs: result.latencyMs,
        message: "BEA NIPA metadata endpoint responded successfully.",
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
            : "BEA health check failed.",
      };
    }
  }

  async fetchAvailableMetrics(): Promise<AvailableMetric[]> {
    return BEA_METRICS.map(({ slug, name, description, unit, frequency }) => ({
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
      throw new Error("BEA API configuration is incomplete.");
    }
    if (request.countryCode && request.countryCode !== "US") {
      throw new Error("BEA NIPA metrics currently support the US only.");
    }
    if (request.endDate < request.startDate) {
      throw new Error(
        "BEA observation end month must not precede start month.",
      );
    }
    const metric = getBeaMetric(request.metricSlug);
    if (!metric) throw new UnsupportedBeaMetricError(request.metricSlug);

    const url = buildBeaDataUrl(
      baseUrl,
      apiKey,
      metric.tableName,
      getBeaYears(request.startDate, request.endDate),
    );
    const requestUrl = sanitiseBeaUrl(url);
    const retrievedAt = (this.options.now ?? (() => new Date()))();
    const response = await fetchBeaJson(url, this.options);
    return parseBeaObservations(
      response.payload,
      metric,
      requestUrl,
      retrievedAt,
      request.startDate,
      request.endDate,
    );
  }
}

export function getBeaMetricAvailabilityLabel(metricSlug: string): string {
  const metric = getBeaMetric(metricSlug);
  if (!metric) throw new UnsupportedBeaMetricError(metricSlug);
  return `${metric.firstAvailablePeriod} through latest published month (${formatBeaMonth(new Date())} or earlier)`;
}
