import { getSourceDefinition } from "@/data-sources/catalog";
import { getSourceConfigurationStatus } from "@/data-sources/configuration";
import { fetchUSBoxOfficeMetadata } from "@/data-sources/film/us-box-office-api";
import type {
  AvailableMetric,
  DataSourceAdapter,
  DataSourceHealth,
  NormalisedObservation,
  ObservationRequest,
} from "@/data-sources/types";

export class USBoxOfficeAdapter implements DataSourceAdapter {
  readonly slug = "us-box-office";
  readonly name = "US Box Office — Provisional";
  readonly countries = ["US"] as const;
  readonly sectors = ["film"] as const;

  constructor(private readonly getBaseUrl: () => string | undefined) {}

  isConfigured(): boolean {
    return getSourceConfigurationStatus(getSourceDefinition("us-box-office"), {
      US_BOX_OFFICE_BASE_URL: this.getBaseUrl(),
    }).configured;
  }

  async healthCheck(): Promise<DataSourceHealth> {
    const checkedAt = new Date();
    if (!this.isConfigured())
      return {
        status: "unavailable",
        checkedAt: checkedAt.toISOString(),
        message: "Kaggle dataset configuration is incomplete.",
      };
    try {
      const result = await fetchUSBoxOfficeMetadata(this.getBaseUrl()!, {
        timeoutMs: 5_000,
      });
      return {
        status: "healthy",
        checkedAt: checkedAt.toISOString(),
        latencyMs: result.latencyMs,
        message: "The public Kaggle dataset metadata endpoint responded.",
      };
    } catch {
      return {
        status: "degraded",
        checkedAt: checkedAt.toISOString(),
        message: "The public Kaggle dataset metadata endpoint was unavailable.",
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
      new Error("US box-office weekends use dedicated dataset persistence."),
    );
  }
}
