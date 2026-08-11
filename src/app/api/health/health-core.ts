import type { RuntimeSourceRegistry } from "@/data-sources/registry-runtime-core";

export function buildHealthResponse(
  registry: RuntimeSourceRegistry,
  timestamp = new Date(),
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
  };
}
