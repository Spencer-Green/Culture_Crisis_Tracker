import { getSourceDefinition } from "@/data-sources/catalog";
import { getSourceConfigurationStatus } from "@/data-sources/configuration";
import { fetchLPAArchiveReports } from "@/data-sources/theatre/lpa-api";
import type {
  AvailableMetric,
  DataSourceAdapter,
  DataSourceHealth,
  NormalisedObservation,
  ObservationRequest,
} from "@/data-sources/types";

export class LPAAdapter implements DataSourceAdapter {
  readonly slug = "lpa";
  readonly name = "Live Performance Australia";
  readonly countries = ["AU"] as const;
  readonly sectors = ["theatre"] as const;

  constructor(private readonly getBaseUrl: () => string | undefined) {}

  isConfigured(): boolean {
    return getSourceConfigurationStatus(getSourceDefinition("lpa"), {
      LPA_BASE_URL: this.getBaseUrl(),
    }).configured;
  }

  async healthCheck(): Promise<DataSourceHealth> {
    const checkedAt = new Date();
    if (!this.isConfigured())
      return {
        status: "unavailable",
        checkedAt: checkedAt.toISOString(),
        message: "LPA public-report configuration is incomplete.",
      };
    const startedAt = Date.now();
    try {
      const result = await fetchLPAArchiveReports(this.getBaseUrl()!, {
        timeoutMs: 7_500,
      });
      return {
        status: result.reports.length ? "healthy" : "degraded",
        checkedAt: checkedAt.toISOString(),
        latencyMs: Date.now() - startedAt,
        message: "LPA public report archive responded.",
      };
    } catch {
      return {
        status: "degraded",
        checkedAt: checkedAt.toISOString(),
        latencyMs: Date.now() - startedAt,
        message: "LPA public report archive was unavailable.",
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
      new Error("LPA annual reports use dedicated structural persistence."),
    );
  }
}
