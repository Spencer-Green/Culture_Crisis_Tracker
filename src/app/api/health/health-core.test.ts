import { describe, expect, it } from "vitest";

import { buildHealthResponse } from "@/app/api/health/health-core";
import { buildStaticSourceRegistry } from "@/data-sources/registry-core";
import { buildRuntimeSourceRegistry } from "@/data-sources/registry-runtime-core";

describe("health response", () => {
  it("reports database degradation without claiming API health", async () => {
    const registry = await buildRuntimeSourceRegistry(
      buildStaticSourceRegistry({
        ABS_BASE_URL: "https://data.api.abs.gov.au/rest",
        ONS_BASE_URL: "https://api.beta.ons.gov.uk/v1",
      }),
      async () => {
        throw new Error("database unavailable");
      },
    );

    const health = buildHealthResponse(
      registry,
      new Date("2026-08-11T00:00:00.000Z"),
    );

    expect(health).toMatchObject({
      status: "degraded",
      application: { status: "available" },
      database: { status: "unavailable" },
      externalApis: { status: "not-checked" },
      sources: {
        supported: 20,
        configured: 2,
        implemented: 17,
        enabled: 0,
      },
    });
  });
});
