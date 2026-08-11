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

  it("enables only ABS and ONS without overwriting operational timestamps", () => {
    const operations = [
      getSourceDefinition("abs"),
      getSourceDefinition("ons"),
    ].map((source) =>
      buildSourceSeedOperation(
        source,
        source.slug === "abs"
          ? { ABS_BASE_URL: "https://data.api.abs.gov.au/rest" }
          : { ONS_BASE_URL: "https://api.beta.ons.gov.uk/v1" },
      ),
    );
    const otherOperations = SOURCE_DEFINITIONS.filter(
      (source) => source.slug !== "abs" && source.slug !== "ons",
    ).map((source) => buildSourceSeedOperation(source, {}));

    expect(operations.map((operation) => operation.where.slug)).toEqual([
      "abs",
      "ons",
    ]);
    expect(
      operations.every(
        (operation) =>
          operation.create.enabled === true &&
          operation.update.enabled === true,
      ),
    ).toBe(true);
    expect(
      otherOperations.every(
        (item) => !item.create.enabled && !item.update.enabled,
      ),
    ).toBe(true);
    for (const operation of operations) {
      expect(operation.update).not.toHaveProperty("lastAttemptedSyncAt");
      expect(operation.update).not.toHaveProperty("lastSuccessfulSyncAt");
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
