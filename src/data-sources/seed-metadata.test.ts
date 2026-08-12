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
      getSourceDefinition("fred"),
      getSourceDefinition("ons"),
    ].map((source) =>
      buildSourceSeedOperation(
        source,
        source.slug === "abs"
          ? { ABS_BASE_URL: "https://data.api.abs.gov.au/rest" }
          : source.slug === "bea"
            ? { BEA_BASE_URL: "https://apps.bea.gov/api/data" }
            : source.slug === "fred"
              ? { FRED_BASE_URL: "https://api.stlouisfed.org/fred" }
              : { ONS_BASE_URL: "https://api.beta.ons.gov.uk/v1" },
      ),
    );
    const otherOperations = SOURCE_DEFINITIONS.filter(
      (source) => !["abs", "bea", "fred", "ons"].includes(source.slug),
    ).map((source) => buildSourceSeedOperation(source, {}));

    expect(operations.map((operation) => operation.where.slug)).toEqual([
      "abs",
      "bea",
      "fred",
      "ons",
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
});
