import { getSourceDefinition } from "@/data-sources/catalog";
import { getSourceConfigurationStatus } from "@/data-sources/configuration";
import {
  buildEurostatDataUrl,
  fetchEurostatJson,
  type EurostatRequestOptions,
} from "@/data-sources/macro/eurostat-api";
import {
  EUROSTAT_METRICS,
  getEurostatMetric,
} from "@/data-sources/macro/eurostat-metrics";
import { formatEurostatYear } from "@/data-sources/macro/eurostat-period";
import { parseEurostatObservations } from "@/data-sources/macro/eurostat-response";
import type {
  AvailableMetric,
  DataSourceAdapter,
  DataSourceHealth,
  NormalisedObservation,
  ObservationRequest,
} from "@/data-sources/types";
import { HttpRequestError } from "@/lib/http";

export type EurostatAdapterOptions = EurostatRequestOptions & {
  getBaseUrl: () => string | undefined;
  now?: () => Date;
};

export class UnsupportedEurostatMetricError extends Error {
  constructor(metricSlug: string) {
    super(`Eurostat metric "${metricSlug}" is not supported.`);
    this.name = "UnsupportedEurostatMetricError";
  }
}

export class EurostatDataSourceAdapter implements DataSourceAdapter {
  readonly slug = "eurostat";
  readonly name = "EU Structural Benchmark";
  readonly countries = ["EU"] as const;
  readonly sectors = ["consumer-spending"] as const;

  constructor(private readonly options: EurostatAdapterOptions) {}

  isConfigured(): boolean {
    return getSourceConfigurationStatus(getSourceDefinition("eurostat"), {
      EUROSTAT_BASE_URL: this.options.getBaseUrl(),
    }).configured;
  }

  async healthCheck(): Promise<DataSourceHealth> {
    const checkedAt = (this.options.now ?? (() => new Date()))();
    const baseUrl = this.options.getBaseUrl();
    if (!baseUrl || !this.isConfigured()) {
      return {
        status: "unavailable",
        checkedAt: checkedAt.toISOString(),
        message: "Eurostat API configuration is incomplete.",
      };
    }
    try {
      const result = await fetchEurostatJson(
        buildEurostatDataUrl(baseUrl, EUROSTAT_METRICS[0], {
          lastTimePeriod: 1,
        }),
        { ...this.options, timeoutMs: this.options.timeoutMs ?? 5_000 },
      );
      parseEurostatObservations(
        result.payload,
        EUROSTAT_METRICS[0],
        "https://ec.europa.eu/eurostat",
        checkedAt,
        "1900",
        "9999",
      );
      return {
        status: "healthy",
        checkedAt: checkedAt.toISOString(),
        latencyMs: result.latencyMs,
        message:
          "Eurostat dissemination statistics endpoint responded successfully.",
      };
    } catch (error) {
      return {
        status:
          error instanceof HttpRequestError && error.kind === "http"
            ? "degraded"
            : "unavailable",
        checkedAt: checkedAt.toISOString(),
        message:
          error instanceof HttpRequestError
            ? error.message
            : "Eurostat health check failed.",
      };
    }
  }

  async fetchAvailableMetrics(): Promise<AvailableMetric[]> {
    return EUROSTAT_METRICS.map(
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
      throw new Error("Eurostat API configuration is incomplete.");
    }
    if (request.countryCode && request.countryCode !== "EU") {
      throw new Error(
        "Eurostat household-consumption metrics support the EU aggregate only.",
      );
    }
    if (request.endDate < request.startDate) {
      throw new Error(
        "Eurostat observation end date must not precede start date.",
      );
    }
    const metric = getEurostatMetric(request.metricSlug);
    if (!metric) throw new UnsupportedEurostatMetricError(request.metricSlug);

    const startYear = formatEurostatYear(request.startDate);
    const endYear = formatEurostatYear(request.endDate);
    const url = buildEurostatDataUrl(baseUrl, metric, { startYear, endYear });
    const retrievedAt = (this.options.now ?? (() => new Date()))();
    const result = await fetchEurostatJson(url, this.options);
    return parseEurostatObservations(
      result.payload,
      metric,
      url.toString(),
      retrievedAt,
      startYear,
      endYear,
    );
  }
}
