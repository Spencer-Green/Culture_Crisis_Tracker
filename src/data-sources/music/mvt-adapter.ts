import { getSourceConfigurationStatus } from "@/data-sources/configuration";
import { getSourceDefinition } from "@/data-sources/catalog";
import { inspectMVTReport } from "@/data-sources/music/mvt-api";
import { MVT_REPORTS } from "@/data-sources/music/mvt-reports";
import type {
  AvailableMetric,
  DataSourceAdapter,
  DataSourceHealth,
  NormalisedObservation,
  ObservationRequest,
} from "@/data-sources/types";

export class MVTAdapter implements DataSourceAdapter {
  readonly slug = "mvt";
  readonly name = "Music Venue Trust";
  readonly countries = ["GB"] as const;
  readonly sectors = ["music"] as const;

  constructor(private readonly getBaseUrl: () => string | undefined) {}

  isConfigured(): boolean {
    return getSourceConfigurationStatus(getSourceDefinition("mvt"), {
      MVT_BASE_URL: this.getBaseUrl(),
    }).configured;
  }

  async healthCheck(): Promise<DataSourceHealth> {
    const checkedAt = new Date();
    if (!this.isConfigured())
      return {
        status: "unavailable",
        checkedAt: checkedAt.toISOString(),
        message: "MVT public-report configuration is incomplete.",
      };
    const latest = MVT_REPORTS.at(-1)!;
    const startedAt = Date.now();
    try {
      const result = await inspectMVTReport({
        year: latest.year,
        url: latest.sourceReportUrl,
        fields: [],
      });
      return {
        status: result.reachable ? "healthy" : "degraded",
        checkedAt: checkedAt.toISOString(),
        latencyMs: Date.now() - startedAt,
        message: result.reachable
          ? "Latest official MVT annual report is reachable."
          : `Official MVT report retrieval returned HTTP ${result.httpStatus}.`,
      };
    } catch {
      return {
        status: "degraded",
        checkedAt: checkedAt.toISOString(),
        latencyMs: Date.now() - startedAt,
        message: "Latest official MVT annual report is unavailable.",
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
      new Error("MVT annual reports use dedicated structural persistence."),
    );
  }
}
