import { getSourceDefinition } from "@/data-sources/catalog";
import { getSourceConfigurationStatus } from "@/data-sources/configuration";
import { fetchScreenAustraliaWidget } from "@/data-sources/film/screen-australia-api";
import type {
  AvailableMetric,
  DataSourceAdapter,
  DataSourceHealth,
  NormalisedObservation,
  ObservationRequest,
} from "@/data-sources/types";

export class ScreenAustraliaAdapter implements DataSourceAdapter {
  readonly slug = "screen-australia";
  readonly name = "Screen Australia Box Office";
  readonly countries = ["AU"] as const;
  readonly sectors = ["film"] as const;

  constructor(private readonly getBaseUrl: () => string | undefined) {}

  isConfigured(): boolean {
    return getSourceConfigurationStatus(
      getSourceDefinition("screen-australia"),
      { SCREEN_AUSTRALIA_BASE_URL: this.getBaseUrl() },
    ).configured;
  }

  async healthCheck(): Promise<DataSourceHealth> {
    const checkedAt = new Date();
    if (!this.isConfigured())
      return {
        status: "unavailable",
        checkedAt: checkedAt.toISOString(),
        message: "Screen Australia widget configuration is incomplete.",
      };
    try {
      const response = await fetchScreenAustraliaWidget(this.getBaseUrl()!, {
        timeoutMs: 7_500,
      });
      return {
        status: "healthy",
        checkedAt: checkedAt.toISOString(),
        latencyMs: response.latencyMs,
        message: "Screen Australia public widget responded.",
      };
    } catch {
      return {
        status: "degraded",
        checkedAt: checkedAt.toISOString(),
        message: "Screen Australia public widget was unavailable.",
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
      new Error(
        "Screen Australia uses dedicated current box-office persistence.",
      ),
    );
  }
}
