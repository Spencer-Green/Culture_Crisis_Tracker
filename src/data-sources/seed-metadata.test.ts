import { describe, expect, it } from "vitest";

import {
  getSourceDefinition,
  SOURCE_DEFINITIONS,
} from "@/data-sources/catalog";
import { buildSourceSeedOperation } from "@/data-sources/seed-metadata";

describe("source seed metadata", () => {
  it("uses unique slugs for idempotent upserts", () => {
    const slugs = SOURCE_DEFINITIONS.map((source) => source.slug);

    expect(new Set(slugs).size).toBe(SOURCE_DEFINITIONS.length);
  });

  it("initialises canonical enablement only when creating sources", () => {
    const operations = [
      getSourceDefinition("abs"),
      getSourceDefinition("bea"),
      getSourceDefinition("eurostat"),
      getSourceDefinition("fred"),
      getSourceDefinition("gdelt"),
      getSourceDefinition("ons"),
      getSourceDefinition("statcan"),
      getSourceDefinition("ticketmaster"),
      getSourceDefinition("igdb"),
      getSourceDefinition("steam"),
      getSourceDefinition("thenewsapi"),
      getSourceDefinition("rss"),
      getSourceDefinition("us-box-office"),
      getSourceDefinition("broadway-business"),
    ].map((source) =>
      buildSourceSeedOperation(
        source,
        source.slug === "abs"
          ? { ABS_BASE_URL: "https://data.api.abs.gov.au/rest" }
          : source.slug === "bea"
            ? { BEA_BASE_URL: "https://apps.bea.gov/api/data" }
            : source.slug === "eurostat"
              ? {
                  EUROSTAT_BASE_URL:
                    "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0",
                }
              : source.slug === "fred"
                ? { FRED_BASE_URL: "https://api.stlouisfed.org/fred" }
                : source.slug === "gdelt"
                  ? { GDELT_BASE_URL: "https://api.gdeltproject.org" }
                  : source.slug === "ons"
                    ? { ONS_BASE_URL: "https://api.beta.ons.gov.uk/v1" }
                    : source.slug === "statcan"
                      ? {
                          STATCAN_BASE_URL:
                            "https://www150.statcan.gc.ca/t1/wds",
                        }
                      : source.slug === "ticketmaster"
                        ? {
                            TICKETMASTER_BASE_URL:
                              "https://app.ticketmaster.com/discovery/v2",
                          }
                        : source.slug === "igdb"
                          ? { IGDB_BASE_URL: "https://api.igdb.com/v4" }
                          : source.slug === "steam"
                            ? {
                                STEAM_BASE_URL: "https://api.steampowered.com/",
                              }
                            : source.slug === "thenewsapi"
                              ? {
                                  THENEWSAPI_BASE_URL:
                                    "https://api.thenewsapi.com/v1",
                                }
                              : source.slug === "rss"
                                ? {
                                    RSS_BASE_URL:
                                      "https://www.rssboard.org/rss-specification",
                                  }
                                : source.slug === "us-box-office"
                                  ? {
                                      US_BOX_OFFICE_BASE_URL:
                                        "https://www.kaggle.com/api/v1",
                                    }
                                  : {
                                      BROADWAY_BUSINESS_BASE_URL:
                                        "https://broadwaybusiness.com/grosses",
                                    },
      ),
    );
    const otherOperations = SOURCE_DEFINITIONS.filter(
      (source) =>
        ![
          "abs",
          "bea",
          "eurostat",
          "fred",
          "gdelt",
          "ons",
          "statcan",
          "ticketmaster",
          "igdb",
          "steam",
          "thenewsapi",
          "rss",
          "us-box-office",
          "broadway-business",
        ].includes(source.slug),
    ).map((source) => buildSourceSeedOperation(source, {}));

    expect(operations.map((operation) => operation.where.slug)).toEqual([
      "abs",
      "bea",
      "eurostat",
      "fred",
      "gdelt",
      "ons",
      "statcan",
      "ticketmaster",
      "igdb",
      "steam",
      "thenewsapi",
      "rss",
      "us-box-office",
      "broadway-business",
    ]);
    expect(
      operations.every(
        (operation) =>
          operation.create.enabled === true && !("enabled" in operation.update),
      ),
    ).toBe(true);
    expect(
      otherOperations.every(
        (item) => !item.create.enabled && !("enabled" in item.update),
      ),
    ).toBe(true);
    for (const operation of operations) {
      expect(operation.update).not.toHaveProperty("lastAttemptedSyncAt");
      expect(operation.update).not.toHaveProperty("lastSuccessfulSyncAt");
      expect(operation.update).not.toHaveProperty("enabled");
    }
  });

  it("keeps multi-source coverage in the static catalogue", () => {
    const operation = buildSourceSeedOperation(
      getSourceDefinition("ticketmaster"),
      {
        TICKETMASTER_BASE_URL: "https://app.ticketmaster.com/discovery/v2",
      },
    );

    expect(operation.update.countryCode).toBeNull();
    expect(operation.update.sectorSlug).toBeNull();
  });

  it("seeds the canonical public Kaggle API URL without local credentials", () => {
    const operation = buildSourceSeedOperation(
      getSourceDefinition("us-box-office"),
      {},
    );

    expect(operation.create.baseUrl).toBe("https://www.kaggle.com/api/v1");
    expect(operation.create.requiresAuthentication).toBe(false);
    expect(operation.create.enabled).toBe(true);
  });
});
