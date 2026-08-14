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
import {
  formatBeaMonth,
  getBeaYears,
  parseBeaMonth,
} from "@/data-sources/macro/bea-period";
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
  readonly sectors = ["consumer-spending", "music"] as const;
  private readonly responseCache = new Map<string, Promise<unknown>>();

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
        message: "BEA metadata endpoint responded successfully.",
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
    return BEA_METRICS.map(
      ({
        slug,
        name,
        description,
        unit,
        frequency,
        countryCode,
        sectorSlug,
      }) => ({
        slug,
        name,
        description,
        unit,
        frequency,
        countryCode,
        sectorSlug,
      }),
    );
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
      throw new Error("BEA metrics currently support the US only.");
    }
    if (request.endDate < request.startDate) {
      throw new Error(
        "BEA observation end month must not precede start month.",
      );
    }
    const metric = getBeaMetric(request.metricSlug);
    if (!metric) throw new UnsupportedBeaMetricError(request.metricSlug);

    const firstAvailableDate = parseBeaMonth(metric.firstAvailablePeriod);
    if (request.endDate < firstAvailableDate) return [];
    const effectiveStartDate =
      request.startDate < firstAvailableDate
        ? firstAvailableDate
        : request.startDate;

    const retrievedAt = (this.options.now ?? (() => new Date()))();
    const years = getBeaYears(effectiveStartDate, request.endDate);
    const observations: NormalisedObservation[] = [];
    for (let index = 0; index < years.length; index += 3) {
      const yearBatch = years.slice(index, index + 3);
      const url = buildBeaDataUrl(
        baseUrl,
        apiKey,
        metric.dataset,
        metric.tableName,
        yearBatch,
      );
      const requestUrl = sanitiseBeaUrl(url);
      let responsePromise = this.responseCache.get(requestUrl);
      if (!responsePromise) {
        responsePromise = fetchBeaJson(url, this.options).then(
          (response) => response.payload,
        );
        this.responseCache.set(requestUrl, responsePromise);
      }
      try {
        observations.push(
          ...parseBeaObservations(
            await responsePromise,
            metric,
            requestUrl,
            retrievedAt,
            effectiveStartDate,
            request.endDate,
          ),
        );
      } catch (error) {
        this.responseCache.delete(requestUrl);
        throw error;
      }
    }
    return observations.sort(
      (left, right) => left.periodStart.getTime() - right.periodStart.getTime(),
    );
  }
}

export function getBeaMetricAvailabilityLabel(metricSlug: string): string {
  const metric = getBeaMetric(metricSlug);
  if (!metric) throw new UnsupportedBeaMetricError(metricSlug);
  return `${metric.firstAvailablePeriod} through latest published month (${formatBeaMonth(new Date())} or earlier)`;
}
