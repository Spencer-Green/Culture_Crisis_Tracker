import { getSourceDefinition } from "@/data-sources/catalog";
import { getSourceConfigurationStatus } from "@/data-sources/configuration";
import { fetchBroadwayBusinessDataset } from "@/data-sources/theatre/broadway-business-api";
import type {
  AvailableMetric,
  DataSourceAdapter,
  DataSourceHealth,
  NormalisedObservation,
  ObservationRequest,
} from "@/data-sources/types";

export class BroadwayBusinessAdapter implements DataSourceAdapter {
  readonly slug = "broadway-business";
  readonly name = "Broadway Business";
  readonly countries = ["US"] as const;
  readonly sectors = ["theatre"] as const;

  constructor(private readonly getBaseUrl: () => string | undefined) {}

  isConfigured(): boolean {
    return getSourceConfigurationStatus(
      getSourceDefinition("broadway-business"),
      { BROADWAY_BUSINESS_BASE_URL: this.getBaseUrl() },
    ).configured;
  }

  async healthCheck(): Promise<DataSourceHealth> {
    const checkedAt = new Date();
    if (!this.isConfigured())
      return {
        status: "unavailable",
        checkedAt: checkedAt.toISOString(),
        message: "Broadway Business configuration is incomplete.",
      };
    const startedAt = performance.now();
    try {
      await fetchBroadwayBusinessDataset(this.getBaseUrl()!, {
        timeoutMs: 7_500,
      });
      return {
        status: "healthy",
        checkedAt: checkedAt.toISOString(),
        latencyMs: Math.round(performance.now() - startedAt),
        message: "Broadway Business structured weekly data responded.",
      };
    } catch {
      return {
        status: "degraded",
        checkedAt: checkedAt.toISOString(),
        message: "Broadway Business structured weekly data was unavailable.",
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
      new Error("Broadway market weeks use dedicated weekly persistence."),
    );
  }
}
