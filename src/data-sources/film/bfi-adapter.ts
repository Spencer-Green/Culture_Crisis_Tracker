import { getSourceDefinition } from "@/data-sources/catalog";
import { getSourceConfigurationStatus } from "@/data-sources/configuration";
import { fetchBFIIndexDownloads } from "@/data-sources/film/bfi-api";
import type {
  AvailableMetric,
  DataSourceAdapter,
  DataSourceHealth,
  NormalisedObservation,
  ObservationRequest,
} from "@/data-sources/types";

export class BFIAdapter implements DataSourceAdapter {
  readonly slug = "bfi";
  readonly name = "British Film Institute";
  readonly countries = ["GB"] as const;
  readonly sectors = ["film"] as const;

  constructor(private readonly getBaseUrl: () => string | undefined) {}

  isConfigured(): boolean {
    return getSourceConfigurationStatus(getSourceDefinition("bfi"), {
      BFI_BASE_URL: this.getBaseUrl(),
    }).configured;
  }

  async healthCheck(): Promise<DataSourceHealth> {
    const checkedAt = new Date();
    if (!this.isConfigured())
      return {
        status: "unavailable",
        checkedAt: checkedAt.toISOString(),
        message: "BFI public download configuration is incomplete.",
      };
    try {
      const result = await fetchBFIIndexDownloads(this.getBaseUrl()!, {
        timeoutMs: 7_500,
      });
      return {
        status: result.downloads.length ? "healthy" : "degraded",
        checkedAt: checkedAt.toISOString(),
        latencyMs: result.latencyMs,
        message: "BFI public weekly report index responded.",
      };
    } catch {
      return {
        status: "degraded",
        checkedAt: checkedAt.toISOString(),
        message: "BFI public weekly report index was unavailable.",
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
      new Error("BFI film data uses dedicated weekly and annual persistence."),
    );
  }
}
