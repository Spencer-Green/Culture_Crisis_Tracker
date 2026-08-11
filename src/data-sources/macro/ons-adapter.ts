import { getSourceDefinition } from "@/data-sources/catalog";
import { getSourceConfigurationStatus } from "@/data-sources/configuration";
import {
  discoverOnsSeries,
  fetchOnsSeriesData,
  type OnsRequestOptions,
} from "@/data-sources/macro/ons-api";
import { getOnsMetric, ONS_METRICS } from "@/data-sources/macro/ons-metrics";
import { formatOnsQuarter } from "@/data-sources/macro/ons-period";
import { parseOnsObservations } from "@/data-sources/macro/ons-response";
import type {
  AvailableMetric,
  DataSourceAdapter,
  DataSourceHealth,
  NormalisedObservation,
  ObservationRequest,
} from "@/data-sources/types";
import { HttpRequestError } from "@/lib/http";

export type OnsAdapterOptions = OnsRequestOptions & {
  getBaseUrl: () => string | undefined;
  now?: () => Date;
};

export class UnsupportedOnsMetricError extends Error {
  constructor(metricSlug: string) {
    super(`ONS metric "${metricSlug}" is not supported.`);
    this.name = "UnsupportedOnsMetricError";
  }
}

export class OnsDataSourceAdapter implements DataSourceAdapter {
  readonly slug = "ons";
  readonly name = "ONS";
  readonly countries = ["GB"] as const;
  readonly sectors = ["consumer-spending"] as const;

  constructor(private readonly options: OnsAdapterOptions) {}

  isConfigured(): boolean {
    return getSourceConfigurationStatus(getSourceDefinition("ons"), {
      ONS_BASE_URL: this.options.getBaseUrl(),
    }).configured;
  }

  async healthCheck(): Promise<DataSourceHealth> {
    const checkedAt = (this.options.now ?? (() => new Date()))();
    const baseUrl = this.options.getBaseUrl();

    if (!baseUrl || !this.isConfigured()) {
      return {
        status: "unavailable",
        checkedAt: checkedAt.toISOString(),
        message: "ONS v1 base URL is not configured.",
      };
    }

    try {
      const startedAt = performance.now();
      await discoverOnsSeries(baseUrl, ONS_METRICS[0], this.options);
      return {
        status: "healthy",
        checkedAt: checkedAt.toISOString(),
        latencyMs: Math.round(performance.now() - startedAt),
        message: "ONS v1 time-series discovery responded successfully.",
      };
    } catch (error) {
      const degraded =
        error instanceof HttpRequestError &&
        (error.kind === "http" || error.kind === "content-type");

      return {
        status: degraded ? "degraded" : "unavailable",
        checkedAt: checkedAt.toISOString(),
        message:
          error instanceof HttpRequestError
            ? error.message
            : "ONS health check failed.",
      };
    }
  }

  async fetchAvailableMetrics(): Promise<AvailableMetric[]> {
    return ONS_METRICS.map(({ slug, name, description, unit, frequency }) => ({
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
    if (!baseUrl || !this.isConfigured()) {
      throw new Error("ONS v1 base URL is not configured.");
    }
    if (request.countryCode && request.countryCode !== "GB") {
      throw new Error("ONS Consumer Trends metrics support the UK only.");
    }

    const metric = getOnsMetric(request.metricSlug);
    if (!metric) {
      throw new UnsupportedOnsMetricError(request.metricSlug);
    }

    const startQuarter = formatOnsQuarter(request.startDate);
    const endQuarter = formatOnsQuarter(request.endDate);
    if (endQuarter < startQuarter) {
      throw new Error(
        "ONS observation end quarter must not precede start quarter.",
      );
    }

    const series = await discoverOnsSeries(baseUrl, metric, this.options);
    const retrievedAt = (this.options.now ?? (() => new Date()))();
    const response = await fetchOnsSeriesData(baseUrl, series, this.options);

    return parseOnsObservations(
      response.body,
      series,
      metric,
      response.responseUrl,
      retrievedAt,
      request.startDate,
      request.endDate,
    );
  }
}
