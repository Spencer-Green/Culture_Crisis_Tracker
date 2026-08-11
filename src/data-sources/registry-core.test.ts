import { describe, expect, it } from "vitest";

import { buildStaticSourceRegistry } from "@/data-sources/registry-core";

describe("source registry", () => {
  it("returns safe metadata for every supported source", () => {
    const apiKey = "api-key-value-must-not-leak";
    const token = "token-value-must-not-leak";
    const clientSecret = "client-secret-value-must-not-leak";
    const databaseUrl = "postgresql://user:password@localhost/private";
    const sources = buildStaticSourceRegistry({
      ABS_BASE_URL: "https://data.api.abs.gov.au/rest",
      ONS_BASE_URL: "https://api.beta.ons.gov.uk/v1",
      BEA_BASE_URL: "https://apps.bea.gov/api/data",
      BEA_API_KEY: apiKey,
      EVENTBRITE_BASE_URL: "https://www.eventbriteapi.com/v3",
      EVENTBRITE_PRIVATE_TOKEN: token,
      IGDB_BASE_URL: "https://api.igdb.com/v4",
      IGDB_CLIENT_ID: "test-client-id",
      IGDB_CLIENT_SECRET: clientSecret,
      DATABASE_URL: databaseUrl,
    });
    const serialised = JSON.stringify(sources);

    expect(sources).toHaveLength(13);
    expect(
      sources.filter((source) => source.implementationStatus === "implemented"),
    ).toHaveLength(2);
    expect(
      sources.find((source) => source.slug === "abs")?.implementationStatus,
    ).toBe("implemented");
    expect(
      sources.find((source) => source.slug === "ons")?.implementationStatus,
    ).toBe("implemented");
    expect(sources.find((source) => source.slug === "ons")?.isPublic).toBe(
      true,
    );
    expect(serialised).not.toContain(apiKey);
    expect(serialised).not.toContain(token);
    expect(serialised).not.toContain(clientSecret);
    expect(serialised).not.toContain(databaseUrl);
  });

  it("keeps implementation, configuration, and health independent", () => {
    const sources = buildStaticSourceRegistry({
      BEA_BASE_URL: "https://apps.bea.gov/api/data",
      BEA_API_KEY: "test-only-key",
    });
    const bea = sources.find((source) => source.slug === "bea");

    expect(bea?.configured).toBe(true);
    expect(bea?.implementationStatus).toBe("not-implemented");
    expect(bea?.healthStatus).toBe("not-checked");
    expect(bea?.requiresAuthentication).toBe(true);
  });

  it("identifies unauthenticated providers as public", () => {
    const sources = buildStaticSourceRegistry({});
    expect(sources.find((source) => source.slug === "abs")?.isPublic).toBe(
      true,
    );
    expect(sources.find((source) => source.slug === "igdb")?.isPublic).toBe(
      false,
    );
  });
});
