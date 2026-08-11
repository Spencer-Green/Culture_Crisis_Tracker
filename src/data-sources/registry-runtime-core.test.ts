import { describe, expect, it } from "vitest";

import { buildStaticSourceRegistry } from "@/data-sources/registry-core";
import { buildRuntimeSourceRegistry } from "@/data-sources/registry-runtime-core";

describe("runtime source registry", () => {
  it("merges mutable database state without changing static status", async () => {
    const staticSources = buildStaticSourceRegistry({
      ABS_BASE_URL: "https://data.api.abs.gov.au/rest",
    });
    const lastAttemptedSyncAt = new Date("2026-08-01T10:00:00.000Z");

    const registry = await buildRuntimeSourceRegistry(
      staticSources,
      async () => [
        {
          slug: "abs",
          enabled: false,
          lastAttemptedSyncAt,
          lastSuccessfulSyncAt: null,
        },
      ],
    );
    const abs = registry.sources.find((source) => source.slug === "abs");

    expect(registry.databaseStatus).toBe("available");
    expect(abs).toMatchObject({
      configured: true,
      implementationStatus: "implemented",
      enabled: false,
      healthStatus: "not-checked",
      runtimeStateStatus: "available",
      lastAttemptedSyncAt: lastAttemptedSyncAt.toISOString(),
    });
  });

  it("degrades safely when the database is unavailable", async () => {
    const staticSources = buildStaticSourceRegistry({});
    const registry = await buildRuntimeSourceRegistry(
      staticSources,
      async () => {
        throw new Error("sensitive database failure");
      },
    );
    const serialised = JSON.stringify(registry);

    expect(registry.databaseStatus).toBe("unavailable");
    expect(
      registry.sources.every(
        (source) =>
          source.enabled === null &&
          source.runtimeStateStatus === "unavailable" &&
          source.healthStatus === "not-checked",
      ),
    ).toBe(true);
    expect(serialised).not.toContain("sensitive database failure");
  });
});
