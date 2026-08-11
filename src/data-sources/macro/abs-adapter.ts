import { getSourceDefinition } from "@/data-sources/catalog";
import { getSourceConfigurationStatus } from "@/data-sources/configuration";
import { parseAbsObservationCsv } from "@/data-sources/macro/abs-csv";
import {
  ABS_DATAFLOW,
  ABS_METRICS,
  getAbsDataKey,
  getAbsMetric,
} from "@/data-sources/macro/abs-metrics";
import { formatAbsPeriod } from "@/data-sources/macro/abs-period";
import type {
  AvailableMetric,
  DataSourceAdapter,
  DataSourceHealth,
  NormalisedObservation,
  ObservationRequest,
} from "@/data-sources/types";
import {
  fetchText,
  HttpRequestError,
  type FetchImplementation,
} from "@/lib/http";

const ABS_CSV_ACCEPT =
  "application/vnd.sdmx.data+csv;version=2.0.0;labels=both";

type AbsAdapterOptions = {
  getBaseUrl: () => string | undefined;
  fetchImplementation?: FetchImplementation;
  timeoutMs?: number;
  now?: () => Date;
};

export class UnsupportedAbsMetricError extends Error {
  constructor(metricSlug: string) {
    super(`ABS metric "${metricSlug}" is not supported.`);
    this.name = "UnsupportedAbsMetricError";
  }
}

export function buildAbsDataUrl(
  baseUrl: string,
  metricSlug: string,
  startPeriod: string,
  endPeriod: string,
): URL {
  const metric = getAbsMetric(metricSlug);
  if (!metric) {
    throw new UnsupportedAbsMetricError(metricSlug);
  }

  const url = new URL(
    `data/${ABS_DATAFLOW.agency},${ABS_DATAFLOW.id},${ABS_DATAFLOW.version}/${getAbsDataKey(metric)}`,
    `${baseUrl.replace(/\/+$/, "")}/`,
  );
  url.searchParams.set("startPeriod", startPeriod);
  url.searchParams.set("endPeriod", endPeriod);
  return url;
}

export class AbsDataSourceAdapter implements DataSourceAdapter {
  readonly slug = "abs";
  readonly name = "ABS";
  readonly countries = ["AU"] as const;
  readonly sectors = ["consumer-spending"] as const;

  private readonly options: AbsAdapterOptions;

  constructor(options: AbsAdapterOptions) {
    this.options = options;
  }

  isConfigured(): boolean {
    return getSourceConfigurationStatus(getSourceDefinition("abs"), {
      ABS_BASE_URL: this.options.getBaseUrl(),
    }).configured;
  }

  async healthCheck(): Promise<DataSourceHealth> {
    const checkedAt = (this.options.now ?? (() => new Date()))();
    const baseUrl = this.options.getBaseUrl();

    if (!baseUrl || !this.isConfigured()) {
      return {
        status: "unavailable",
        checkedAt: checkedAt.toISOString(),
        message: "ABS base URL is not configured.",
      };
    }

    const url = new URL(
      `dataflow/${ABS_DATAFLOW.agency}/${ABS_DATAFLOW.id}/${ABS_DATAFLOW.version}`,
      `${baseUrl.replace(/\/+$/, "")}/`,
    );

    try {
      const response = await fetchText(url, {
        accept: "application/vnd.sdmx.structure+json;version=1.0",
        acceptedContentTypes: [
          "application/vnd.sdmx.structure+json",
          "application/json",
        ],
        timeoutMs: this.options.timeoutMs ?? 5_000,
        maxResponseBytes: 100_000,
        fetchImplementation: this.options.fetchImplementation,
      });

      return {
        status: "healthy",
        checkedAt: checkedAt.toISOString(),
        latencyMs: response.latencyMs,
        message: "ABS HSI_M metadata endpoint responded successfully.",
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
            : "ABS health check failed.",
      };
    }
  }

  async fetchAvailableMetrics(): Promise<AvailableMetric[]> {
    return ABS_METRICS.map(({ slug, name, description, unit, frequency }) => ({
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
      throw new Error("ABS base URL is not configured.");
    }
    if (request.countryCode && request.countryCode !== "AU") {
      throw new Error("ABS HSI_M metrics currently support Australia only.");
    }

    const startPeriod = formatAbsPeriod(request.startDate);
    const endPeriod = formatAbsPeriod(request.endDate);
    if (endPeriod < startPeriod) {
      throw new Error(
        "ABS observation end period must not precede start period.",
      );
    }

    const metric = getAbsMetric(request.metricSlug);
    if (!metric) {
      throw new UnsupportedAbsMetricError(request.metricSlug);
    }

    const url = buildAbsDataUrl(baseUrl, metric.slug, startPeriod, endPeriod);
    const retrievedAt = (this.options.now ?? (() => new Date()))();
    const response = await fetchText(url, {
      accept: ABS_CSV_ACCEPT,
      acceptedContentTypes: ["application/vnd.sdmx.data+csv", "text/csv"],
      timeoutMs: this.options.timeoutMs ?? 15_000,
      fetchImplementation: this.options.fetchImplementation,
    });

    return parseAbsObservationCsv(
      response.body,
      metric,
      response.responseUrl,
      retrievedAt,
    ).observations;
  }
}
