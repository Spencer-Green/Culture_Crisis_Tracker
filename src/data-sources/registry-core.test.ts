import { describe, expect, it } from "vitest";

import { buildStaticSourceRegistry } from "@/data-sources/registry-core";

describe("source registry", () => {
  it("returns safe metadata for every supported source", () => {
    const apiKey = "api-key-value-must-not-leak";
    const token = "token-value-must-not-leak";
    const clientSecret = "client-secret-value-must-not-leak";
    const fredApiKey = "fred-api-key-value-must-not-leak";
    const databaseUrl = "postgresql://user:password@localhost/private";
    const sources = buildStaticSourceRegistry({
      ABS_BASE_URL: "https://data.api.abs.gov.au/rest",
      ONS_BASE_URL: "https://api.beta.ons.gov.uk/v1",
      BEA_BASE_URL: "https://apps.bea.gov/api/data",
      BEA_API_KEY: apiKey,
      FRED_BASE_URL: "https://api.stlouisfed.org/fred",
      FRED_API_KEY: fredApiKey,
      EUROSTAT_BASE_URL:
        "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0",
      STATCAN_BASE_URL: "https://www150.statcan.gc.ca/t1/wds",
      GDELT_BASE_URL: "https://api.gdeltproject.org",
      TICKETMASTER_BASE_URL: "https://app.ticketmaster.com/discovery/v2",
      TICKETMASTER_API_KEY: apiKey,
      EVENTBRITE_BASE_URL: "https://www.eventbriteapi.com/v3",
      EVENTBRITE_PRIVATE_TOKEN: token,
      IGDB_BASE_URL: "https://api.igdb.com/v4",
      IGDB_CLIENT_ID: "test-client-id",
      IGDB_CLIENT_SECRET: clientSecret,
      THENEWSAPI_API_KEY: apiKey,
      THENEWSAPI_BASE_URL: "https://api.thenewsapi.com/v1",
      RSS_BASE_URL: "https://www.rssboard.org/rss-specification",
      US_BOX_OFFICE_BASE_URL: "https://www.kaggle.com/api/v1",
      BROADWAY_BUSINESS_BASE_URL: "https://broadwaybusiness.com/grosses",
      BFI_BASE_URL:
        "https://www.bfi.org.uk/industry-data-insights/weekend-box-office-figures",
      SCREEN_AUSTRALIA_BASE_URL:
        "https://box-office-widget.twistedpear-wgp.workers.dev",
      MVT_BASE_URL: "https://www.musicvenuetrust.com/resources/",
      LPA_BASE_URL: "https://reports.liveperformance.com.au/",
      CENSUS_BASE_URL: "https://www2.census.gov/programs-surveys/aies/data",
      DATABASE_URL: databaseUrl,
    });
    const serialised = JSON.stringify(sources);

    expect(sources).toHaveLength(31);
    expect(
      sources.filter((source) => source.implementationStatus === "implemented"),
    ).toHaveLength(28);
    expect(
      sources.find((source) => source.slug === "abs")?.implementationStatus,
    ).toBe("implemented");
    expect(
      sources.find((source) => source.slug === "ons")?.implementationStatus,
    ).toBe("implemented");
    expect(
      sources.find((source) => source.slug === "bea")?.implementationStatus,
    ).toBe("implemented");
    expect(
      sources.find((source) => source.slug === "fred")?.implementationStatus,
    ).toBe("implemented");
    expect(
      sources.find((source) => source.slug === "eurostat")
        ?.implementationStatus,
    ).toBe("implemented");
    expect(sources.find((source) => source.slug === "eurostat")).toMatchObject({
      name: "EU Structural Benchmark",
      configured: true,
      isPublic: true,
      requiresAuthentication: false,
    });
    expect(sources.find((source) => source.slug === "statcan")).toMatchObject({
      configured: true,
      implementationStatus: "implemented",
      isPublic: true,
      requiresAuthentication: false,
    });
    expect(sources.find((source) => source.slug === "gdelt")).toMatchObject({
      configured: true,
      implementationStatus: "implemented",
      isPublic: true,
      requiresAuthentication: false,
      countries: ["AU", "US", "GB", "CA"],
    });
    expect(
      sources.find((source) => source.slug === "ticketmaster"),
    ).toMatchObject({
      configured: true,
      implementationStatus: "implemented",
      isPublic: false,
      requiresAuthentication: true,
      countries: ["AU", "US", "GB", "CA"],
    });
    expect(sources.find((source) => source.slug === "igdb")).toMatchObject({
      configured: true,
      implementationStatus: "implemented",
      requiresAuthentication: true,
    });
    expect(
      sources.find((source) => source.slug === "thenewsapi"),
    ).toMatchObject({
      configured: true,
      implementationStatus: "implemented",
      requiresAuthentication: true,
    });
    expect(sources.find((source) => source.slug === "rss")).toMatchObject({
      configured: true,
      implementationStatus: "implemented",
      isPublic: true,
    });
    expect(
      sources.find((source) => source.slug === "copyright-newsnet"),
    ).toMatchObject({
      configured: true,
      implementationStatus: "implemented",
      sourceUrl: "https://www.copyright.gov/rss/newsnet.xml",
      evidenceRole: "PRIMARY_DOCUMENT",
      sourcePerspective: "OFFICIAL",
      jurisdiction: "US",
      sourceSpecialisms: ["AI_POLICY", "COPYRIGHT", "CREATOR_RIGHTS"],
    });
    expect(
      sources.find((source) => source.slug === "us-box-office"),
    ).toMatchObject({
      configured: true,
      implementationStatus: "implemented",
      isPublic: true,
      countries: ["US"],
      sectors: ["film"],
    });
    expect(
      sources.find((source) => source.slug === "broadway-business"),
    ).toMatchObject({
      configured: true,
      implementationStatus: "implemented",
      isPublic: true,
      countries: ["US"],
      sectors: ["theatre"],
    });
    expect(sources.find((source) => source.slug === "bfi")).toMatchObject({
      configured: true,
      implementationStatus: "implemented",
      isPublic: true,
      countries: ["GB"],
      sectors: ["film"],
    });
    expect(
      sources.find((source) => source.slug === "screen-australia"),
    ).toMatchObject({
      configured: true,
      implementationStatus: "implemented",
      isPublic: true,
      countries: ["AU"],
      sectors: ["film"],
    });
    expect(sources.find((source) => source.slug === "mvt")).toMatchObject({
      configured: true,
      implementationStatus: "implemented",
      isPublic: true,
      countries: ["GB"],
      sectors: ["music"],
    });
    expect(sources.find((source) => source.slug === "lpa")).toMatchObject({
      configured: true,
      implementationStatus: "implemented",
      isPublic: true,
      countries: ["AU"],
      sectors: ["theatre"],
    });
    expect(sources.find((source) => source.slug === "census")).toMatchObject({
      configured: true,
      implementationStatus: "implemented",
      isPublic: true,
      countries: ["US"],
      sectors: ["music"],
    });
    expect(sources.find((source) => source.slug === "ons")?.isPublic).toBe(
      true,
    );
    expect(serialised).not.toContain(apiKey);
    expect(serialised).not.toContain(token);
    expect(serialised).not.toContain(clientSecret);
    expect(serialised).not.toContain(fredApiKey);
    expect(serialised).not.toContain(databaseUrl);
  });

  it("keeps implementation, configuration, and health independent", () => {
    const sources = buildStaticSourceRegistry({
      BEA_BASE_URL: "https://apps.bea.gov/api/data",
      BEA_API_KEY: "test-only-key",
    });
    const bea = sources.find((source) => source.slug === "bea");

    expect(bea?.configured).toBe(true);
    expect(bea?.implementationStatus).toBe("implemented");
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
