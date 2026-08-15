import type { RuntimeSourceRegistry } from "@/data-sources/registry-runtime-core";
import type { FreshnessStatus } from "@/services/scheduler/types";

export function buildHealthResponse(
  registry: RuntimeSourceRegistry,
  timestamp = new Date(),
  scheduler?: {
    databaseStatus: "available" | "unavailable";
    summary: Record<FreshnessStatus, number>;
  },
) {
  const databaseConnected = registry.databaseStatus === "available";

  return {
    status: databaseConnected ? ("ok" as const) : ("degraded" as const),
    timestamp: timestamp.toISOString(),
    application: {
      status: "available" as const,
    },
    database: {
      status: databaseConnected
        ? ("connected" as const)
        : ("unavailable" as const),
    },
    externalApis: {
      status: "not-checked" as const,
    },
    sources: {
      supported: registry.sources.length,
      configured: registry.sources.filter((source) => source.configured).length,
      implemented: registry.sources.filter(
        (source) => source.implementationStatus === "implemented",
      ).length,
      enabled: registry.sources.filter((source) => source.enabled === true)
        .length,
    },
    scheduler: scheduler
      ? {
          status: scheduler.databaseStatus,
          current: scheduler.summary.CURRENT + scheduler.summary.DUE_SOON,
          running: scheduler.summary.RUNNING,
          stale: scheduler.summary.STALE + scheduler.summary.OVERDUE,
          blocked: scheduler.summary.BLOCKED,
          failed: scheduler.summary.FAILED_RECENTLY,
          structural: scheduler.summary.STRUCTURAL,
        }
      : { status: "not-checked" as const },
  };
}
