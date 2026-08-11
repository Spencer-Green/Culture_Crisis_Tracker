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

  it("defaults new sources to disabled without overwriting runtime state", () => {
    const operation = buildSourceSeedOperation(getSourceDefinition("abs"), {
      ABS_BASE_URL: "https://data.api.abs.gov.au/rest",
    });

    expect(operation.where).toEqual({ slug: "abs" });
    expect(operation.create.enabled).toBe(false);
    expect(operation.update).not.toHaveProperty("enabled");
    expect(operation.update).not.toHaveProperty("lastAttemptedSyncAt");
    expect(operation.update).not.toHaveProperty("lastSuccessfulSyncAt");
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
