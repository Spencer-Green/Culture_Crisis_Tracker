import { getSourceDefinition } from "@/data-sources/catalog";
import { getSourceConfigurationStatus } from "@/data-sources/configuration";
import { inspectCensusAies } from "@/data-sources/music/census-aies-api";
import type {
  AvailableMetric,
  DataSourceAdapter,
  DataSourceHealth,
  NormalisedObservation,
  ObservationRequest,
} from "@/data-sources/types";

export class CensusAiesAdapter implements DataSourceAdapter {
  readonly slug = "census";
  readonly name = "US Census Bureau";
  readonly countries = ["US"] as const;
  readonly sectors = ["music"] as const;

  constructor(private readonly getBaseUrl: () => string | undefined) {}

  isConfigured(): boolean {
    return getSourceConfigurationStatus(getSourceDefinition("census"), {
      CENSUS_BASE_URL: this.getBaseUrl(),
    }).configured;
  }

  async healthCheck(): Promise<DataSourceHealth> {
    const checkedAt = new Date();
    if (!this.isConfigured())
      return {
        status: "unavailable",
        checkedAt: checkedAt.toISOString(),
        message: "Census AIES public-download configuration is incomplete.",
      };
    const startedAt = Date.now();
    try {
      const result = await inspectCensusAies(this.getBaseUrl()!, {
        timeoutMs: 20_000,
      });
      return {
        status: result.records.length ? "healthy" : "degraded",
        checkedAt: checkedAt.toISOString(),
        latencyMs: Date.now() - startedAt,
        message: "Official Census AIES employer tables responded.",
      };
    } catch {
      return {
        status: "degraded",
        checkedAt: checkedAt.toISOString(),
        latencyMs: Date.now() - startedAt,
        message: "Official Census AIES employer tables were unavailable.",
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
      new Error("Census AIES music data uses dedicated annual persistence."),
    );
  }
}
